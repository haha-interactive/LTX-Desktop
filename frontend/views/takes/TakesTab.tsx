import { Layers, Loader2, AlertCircle } from 'lucide-react'
import { useTakesTabData } from './useTakesTabData'
import { TakeFolderCard } from './TakeFolderCard'
import { TakeFolderDetailPanel } from './TakeFolderDetailPanel'

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
  } = useTakesTabData({ projectId })

  return (
    <div className="h-full flex bg-background">
      {/* Sidebar */}
      <aside className="w-72 border-r border-zinc-800 flex flex-col flex-shrink-0">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
          <Layers className="h-4 w-4 text-blue-400" />
          <h2 className="text-sm font-semibold text-white">Take folders</h2>
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
              No take folders yet. Use <em>Save as Take</em> in the Video Editor or drop folders into your project's <code className="text-zinc-400">takes/</code> directory.
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
    </div>
  )
}
