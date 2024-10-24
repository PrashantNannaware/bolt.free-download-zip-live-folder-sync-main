import { useStore } from '@nanostores/react';
import { motion, type HTMLMotionProps, type Variants } from 'framer-motion';
import { computed } from 'nanostores';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import {
  type OnChangeCallback as OnEditorChange,
  type OnScrollCallback as OnEditorScroll
} from '~/components/editor/codemirror/CodeMirrorEditor';
import { IconButton } from '~/components/ui/IconButton';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import { Slider, type SliderOptions } from '~/components/ui/Slider';
import { workbenchStore, type WorkbenchViewType } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';
import { renderLogger } from '~/utils/logger';
import { EditorPanel } from './EditorPanel';
import { Preview } from './Preview';

interface WorkspaceProps {
  chatStarted?: boolean;
  isStreaming?: boolean;
}

const viewTransition = { ease: cubicEasingFn };

const sliderOptions: SliderOptions<WorkbenchViewType> = {
  left: {
    value: 'code',
    text: 'Code'
  },
  right: {
    value: 'preview',
    text: 'Preview'
  }
};

const workbenchVariants = {
  closed: {
    width: 0,
    transition: {
      duration: 0.2,
      ease: cubicEasingFn
    }
  },
  open: {
    width: 'var(--workbench-width)',
    transition: {
      duration: 0.2,
      ease: cubicEasingFn
    }
  }
} satisfies Variants;

export const Workbench = memo(({ chatStarted, isStreaming }: WorkspaceProps) => {
  renderLogger.trace('Workbench');

  const [isSyncing, setIsSyncing] = useState(false);

  const hasPreview = useStore(computed(workbenchStore.previews, (previews) => previews.length > 0));
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const selectedFile = useStore(workbenchStore.selectedFile);
  const currentDocument = useStore(workbenchStore.currentDocument);
  const unsavedFiles = useStore(workbenchStore.unsavedFiles);
  const files = useStore(workbenchStore.files);
  const selectedView = useStore(workbenchStore.currentView);
  const directoryRef = useRef<FileSystemDirectoryHandle | undefined>(undefined);
  const [lastSync, setLastSync] = useState<number | false>(false);
  const [isSyncFeatureAvailable, setIsSyncFeatureAvailable] = useState(false);

  useEffect(() => {
    // Check if the `showDirectoryPicker` feature is available in the browser
    if (window.showDirectoryPicker) {
      setIsSyncFeatureAvailable(true);
    } else {
      setIsSyncFeatureAvailable(false);
    }
  }, []); // Empty dependency array ensures this runs once after initial render

  const setSelectedView = (view: WorkbenchViewType) => {
    workbenchStore.currentView.set(view);
  };

  const handleExport = () => {
    console.log('handle export');
    workbenchStore.exportProjectAsZip();
  };

  useEffect(() => {
    if (hasPreview) {
      setSelectedView('preview');
    }
  }, [hasPreview]);

  useEffect(() => {
    workbenchStore.setDocuments(files);
    handleSyncFiles();
  }, [files]);

  const onEditorChange = useCallback<OnEditorChange>((update) => {
    workbenchStore.setCurrentDocumentContent(update.content);
  }, []);

  const onEditorScroll = useCallback<OnEditorScroll>((position) => {
    workbenchStore.setCurrentDocumentScrollPosition(position);
  }, []);

  const onFileSelect = useCallback((filePath: string | undefined) => {
    workbenchStore.setSelectedFile(filePath);
  }, []);

  const onFileSave = useCallback(() => {
    workbenchStore.saveCurrentDocument().catch(() => {
      toast.error('Failed to update file content');
    });
  }, []);

  const onFileReset = useCallback(() => {
    workbenchStore.resetCurrentDocument();
  }, []);

  const handleSyncFiles = useCallback(async (e?: React.MouseEvent) => {
    if (directoryRef.current || e) {
      setIsSyncing(true);

      try {
        const directoryHandle: FileSystemDirectoryHandle = directoryRef.current || await window.showDirectoryPicker();
        directoryRef.current = directoryHandle; // update the ref to have the latest value

        await workbenchStore.syncFiles(directoryHandle);
        setLastSync(new Date().getTime());
      } catch (error) {
        console.error('Error syncing files:', error);
      } finally {
        setIsSyncing(false);
      }
    }
  }, []);

  let label;
  if (lastSync) {
    const now = new Date();
    const seconds = Math.floor((now - lastSync) / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    label = `${minutes > 0 ? minutes + 'm' : ''} ${remainingSeconds}s ago`;
  }

  let syncLabel = "Live Sync in Chrome, Edge, Opera";
  if(isSyncFeatureAvailable) {
    if(isSyncing) {
      syncLabel = "Syncing...";
    } else {
      syncLabel = lastSync ? 'Synced ' + label : 'Select sync folder'
    }
  }

  return (
    chatStarted && (
      <motion.div
        initial="closed"
        animate={showWorkbench ? 'open' : 'closed'}
        variants={workbenchVariants}
        className="z-workbench"
      >
        <div
          className={classNames(
            'fixed top-[calc(var(--header-height)+1.5rem)] bottom-6 w-[var(--workbench-inner-width)] mr-4 z-0 transition-[left,width] duration-200 bolt-ease-cubic-bezier',
            {
              'left-[var(--workbench-left)]': showWorkbench,
              'left-[100%]': !showWorkbench
            }
          )}
        >
          <div className="absolute inset-0 px-6">
            <div
              className="h-full flex flex-col bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor shadow-sm rounded-lg overflow-hidden">
              <div className="flex items-center px-3 py-2 border-b border-bolt-elements-borderColor">
                <Slider selected={selectedView} options={sliderOptions} setSelected={setSelectedView} />
                <IconButton onClick={handleExport} icon="i-ph-download-simple" label="Download Project" />
                <div className="ml-auto" />
                <>
                  <PanelHeaderButton disabled={!isSyncFeatureAvailable || isSyncing} className="mr-1 text-sm" onClick={handleSyncFiles}>
                    {isSyncing ? <div className="i-ph:spinner" /> : <div className="i-ph:cloud-arrow-down" />}
                    {syncLabel}
                  </PanelHeaderButton>
                  <PanelHeaderButton
                    className="mr-1 text-sm"
                    onClick={(event) => {
                      workbenchStore.toggleTerminal(!workbenchStore.showTerminal.get());
                    }}
                  >
                    <div className="i-ph:terminal" />
                    Toggle Terminal
                  </PanelHeaderButton>
                </>
                <IconButton
                  icon="i-ph:x-circle"
                  className="-mr-1"
                  size="xl"
                  onClick={() => {
                    workbenchStore.showWorkbench.set(false);
                  }}
                />
              </div>
              <div className="relative flex-1 overflow-hidden">
                <View
                  initial={{ x: selectedView === 'code' ? 0 : '-100%' }}
                  animate={{ x: selectedView === 'code' ? 0 : '-100%' }}
                >
                  <EditorPanel
                    editorDocument={currentDocument}
                    isStreaming={isStreaming}
                    selectedFile={selectedFile}
                    files={files}
                    unsavedFiles={unsavedFiles}
                    onFileSelect={onFileSelect}
                    onEditorScroll={onEditorScroll}
                    onEditorChange={onEditorChange}
                    onFileSave={onFileSave}
                    onFileReset={onFileReset}
                  />
                </View>
                <View
                  initial={{ x: selectedView === 'preview' ? 0 : '100%' }}
                  animate={{ x: selectedView === 'preview' ? 0 : '100%' }}
                >
                  <Preview />
                </View>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    )
  );
});

interface ViewProps extends HTMLMotionProps<'div'> {
  children: JSX.Element;
}

const View = memo(({ children, ...props }: ViewProps) => {
  return (
    <motion.div className="absolute inset-0" transition={viewTransition} {...props}>
      {children}
    </motion.div>
  );
});