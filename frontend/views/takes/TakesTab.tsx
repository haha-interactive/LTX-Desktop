import { Layers, Loader2, AlertCircle, FolderInput } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { Tooltip } from '../../components/ui/tooltip'
import { useTakesTabData } from './useTakesTabData'
import { TakeFolderCard } from './TakeFolderCard'
import { TakeFolderDetailPanel } from './TakeFolderDetailPanel'
import { ImportTakeFolderDialog } from './ImportTakeFolderDialog'

interface TakesTabProps {
  projectId: string
}

export function TakesTab({ projectId }: TakesTabProps) {
  const {
    folders,
    loadingList,
    listError,
    selectedFolderPath,
    setSelectedFolderPath,
    folderDetail,
    loadingDetail,
    detailError,
    linkedAssetsForSelectedFolder,
    replaceTakeVideo,
    updateTakeMetadata,
    setDefaultTake,
    addTake,
    renameFolder,
    importInspections,
    startImport,
    finishImport,
    cancelImport,
  } = useTakesTabData({ projectId })

  return (
    <div className="h-full flex bg-background">
      {/* Sidebar */}
      <aside className="w-72 border-r border-zinc-800 flex flex-col flex-shrink-0">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-400" />
            <h2 className="text-sm font-semibold text-white">Take folders</h2>
          </div>
          <Tooltip content="Import an external take folder into this project">
            <Button
              variant="outline"
              size="sm"
              className="h-7 border-zinc-700 text-zinc-300 text-[11px] px-2.5"
              onClick={() => void startImport()}
            >
              <FolderInput className="h-3 w-3 mr-1" />
              Import
            </Button>
          </Tooltip>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loadingList ? (
            <div className="flex items-center gap-2 text-xs text-zinc-500 px-2 py-3">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading...
            </div>
          ) : listError ? (
            <div className="flex items-start gap-2 text-xs text-red-400 px-2 py-3">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span className="break-words">{listError}</span>
            </div>
          ) : folders.length === 0 ? (
            <div className="text-xs text-zinc-500 px-2 py-3">
              No take folders yet. Click <strong>Import</strong> above to import from an external folder, or use <em>Save as Take</em> in the Video Editor.
            </div>
          ) : (
            folders.map(folder => (
              <TakeFolderCard
                key={folder.path}
                folder={folder}
                selected={folder.path === selectedFolderPath}
                onSelect={() => setSelectedFolderPath(folder.path)}
              />
            ))
          )}
        </div>
      </aside>

      {/* Detail panel */}
      <main className="flex-1 min-w-0">
        <TakeFolderDetailPanel
          folderDetail={folderDetail}
          loading={loadingDetail}
          error={detailError}
          linkedAssets={linkedAssetsForSelectedFolder}
          onUpdateMetadata={updateTakeMetadata}
          onSetDefaultTake={setDefaultTake}
          onReplaceTakeVideo={replaceTakeVideo}
          onAddTake={addTake}
          onRenameFolder={renameFolder}
        />
      </main>

      {importInspections && importInspections.length > 0 && (
        <ImportTakeFolderDialog
          inspections={importInspections}
          onConfirm={finishImport}
          onCancel={cancelImport}
        />
      )}
    </div>
  )
}
