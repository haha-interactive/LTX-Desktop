import { useCallback, useState } from 'react'
import { useProjects } from '../../contexts/ProjectContext'
import type { StoryboardItem } from '../../lib/storyboard-storage'
import { StoryboardSidebar } from './StoryboardSidebar'
import { StoryboardGrid } from './StoryboardGrid'
import { StoryboardActionsBar } from './StoryboardActionsBar'
import { StoryboardPreviewModal } from './StoryboardPreviewModal'
import { useStoryboardData } from './useStoryboardData'
import { makeId } from '../editor/editor-actions'

interface StoryboardTabProps {
  projectId: string
}

type PreviewState =
  | { source: 'grid'; index: number }
  | { source: 'sidebar'; assetIds: string[]; index: number }
  | null

export function StoryboardTab({ projectId }: StoryboardTabProps) {
  const { activeProject } = useProjects()
  const {
    items,
    sortMode,
    addItems,
    removeItem,
    moveItem,
    setItemTakeIndex,
    cycleSortMode,
  } = useStoryboardData({ projectId, project: activeProject })

  const [preview, setPreview] = useState<PreviewState>(null)

  const handlePreviewGridItem = useCallback((index: number) => {
    setPreview({ source: 'grid', index })
  }, [])

  const handlePreviewSidebarAsset = useCallback((assetIds: string[], index: number) => {
    setPreview({ source: 'sidebar', assetIds, index })
  }, [])

  const handleClosePreview = useCallback(() => setPreview(null), [])

  const handlePreviewIndexChange = useCallback((next: number) => {
    setPreview(prev => {
      if (!prev) return prev
      return { ...prev, index: next }
    })
  }, [])

  if (!activeProject) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-zinc-500">
        No active project.
      </div>
    )
  }

  // Build the preview's item list based on the source.
  const previewItems: StoryboardItem[] = (() => {
    if (!preview) return []
    if (preview.source === 'grid') return items
    // Sidebar source: synthesize transient StoryboardItems (no takeIndex override)
    return preview.assetIds.map(assetId => ({ id: makeId('preview'), assetId }))
  })()

  return (
    <div className="h-full flex bg-background">
      <StoryboardSidebar
        projectId={projectId}
        assets={activeProject.assets}
        onPreviewAsset={handlePreviewSidebarAsset}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <StoryboardGrid
          items={items}
          project={activeProject}
          sortMode={sortMode}
          onAddAssets={addItems}
          onRemoveItem={removeItem}
          onMoveItem={moveItem}
          onSetItemTakeIndex={setItemTakeIndex}
          onCycleSortMode={cycleSortMode}
          onPreviewItem={handlePreviewGridItem}
        />
        <StoryboardActionsBar project={activeProject} items={items} />
      </div>
      {preview && previewItems.length > 0 && (
        <StoryboardPreviewModal
          project={activeProject}
          items={previewItems}
          index={preview.index}
          onClose={handleClosePreview}
          onIndexChange={handlePreviewIndexChange}
        />
      )}
    </div>
  )
}
