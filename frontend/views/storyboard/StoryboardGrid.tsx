import { useCallback, useRef, useState } from 'react'
import { Layers, ArrowDownAZ, ArrowUpZA, ArrowDownUp } from 'lucide-react'
import type { Project } from '../../types/project-model'
import type { StoryboardItem } from '../../lib/storyboard-storage'
import { resolveStoryboardItems } from './storyboard-utils'
import { StoryboardCard } from './StoryboardCard'
import { SB_DRAG_TYPE } from './StoryboardSidebar'
import type { SortMode } from './useStoryboardData'

const GRID_ITEM_DRAG_TYPE = 'storyboard/item-id'

interface StoryboardGridProps {
  items: StoryboardItem[]
  project: Project
  sortMode: SortMode
  onAddAssets: (assetIds: string[]) => void
  onRemoveItem: (itemId: string) => void
  onMoveItem: (sourceId: string, targetId: string | null) => void
  onSetItemTakeIndex: (itemId: string, takeIndex: number | undefined) => void
  onCycleSortMode: () => void
  onPreviewItem?: (index: number) => void
}

export function StoryboardGrid({
  items,
  project,
  sortMode,
  onAddAssets,
  onRemoveItem,
  onMoveItem,
  onSetItemTakeIndex,
  onCycleSortMode,
  onPreviewItem,
}: StoryboardGridProps) {
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null)
  const [dropTargetId, setDropTargetId] = useState<string | 'end' | null>(null)
  const [isDragActive, setIsDragActive] = useState(false)
  const dragEnterCountRef = useRef(0)

  const resolvedItems = resolveStoryboardItems(items, project)

  const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes(SB_DRAG_TYPE) ? 'copy' : 'move'
  }, [])

  const handleContainerDragEnter = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    dragEnterCountRef.current += 1
    setIsDragActive(true)
  }, [])

  const handleContainerDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    dragEnterCountRef.current = Math.max(0, dragEnterCountRef.current - 1)
    if (dragEnterCountRef.current === 0) {
      setIsDragActive(false)
      setDropTargetId(null)
    }
  }, [])

  const resetDragState = useCallback(() => {
    setIsDragActive(false)
    setDropTargetId(null)
    setDraggingItemId(null)
    dragEnterCountRef.current = 0
  }, [])

  const handleSlotDragOver = useCallback((targetId: string | 'end', e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDropTargetId(targetId)
  }, [])

  const handleSlotDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    e.stopPropagation()
    // Only clear if leaving the actual element (not entering a child)
    if (e.currentTarget === e.target) setDropTargetId(null)
  }, [])

  const handleDrop = useCallback((targetId: string | null, e: React.DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    resetDragState()
    const sidebarPayload = e.dataTransfer.getData(SB_DRAG_TYPE)
    if (sidebarPayload) {
      try {
        const ids = JSON.parse(sidebarPayload) as string[]
        if (Array.isArray(ids) && ids.length > 0) onAddAssets(ids)
      } catch { /* ignore */ }
      return
    }
    const movingItemId = e.dataTransfer.getData(GRID_ITEM_DRAG_TYPE)
    if (movingItemId) onMoveItem(movingItemId, targetId)
  }, [onAddAssets, onMoveItem, resetDragState])

  const sortIndicator = sortMode === 'name-asc'
    ? <ArrowDownAZ className="h-3.5 w-3.5" />
    : sortMode === 'name-desc'
      ? <ArrowUpZA className="h-3.5 w-3.5" />
      : <ArrowDownUp className="h-3.5 w-3.5" />
  const sortLabel = sortMode === 'name-asc' ? 'Name A→Z' : sortMode === 'name-desc' ? 'Name Z→A' : 'Order'

  return (
    <div
      className="flex-1 flex flex-col min-h-0"
      onDragOver={handleDragOver}
      onDragEnter={handleContainerDragEnter}
      onDragLeave={handleContainerDragLeave}
      onDrop={(e) => handleDrop(null, e)}
    >
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-2 flex-shrink-0">
        <Layers className="h-4 w-4 text-blue-400" />
        <h2 className="text-sm font-semibold text-white">Storyboard</h2>
        <span className="text-xs text-zinc-500">·</span>
        <span className="text-xs text-zinc-500">{items.length} item{items.length === 1 ? '' : 's'}</span>
        <div className="flex-1" />
        <button
          onClick={onCycleSortMode}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          title="Click to cycle: order → A→Z → Z→A → order"
        >
          {sortIndicator}
          {sortLabel}
        </button>
      </div>

      {/* Grid area */}
      <div className="flex-1 overflow-y-auto p-4">
        {resolvedItems.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-zinc-500">
            <div className="text-center">
              <Layers className="h-10 w-10 mx-auto mb-3 text-zinc-700" />
              <p>Drag image and video assets here from the sidebar to build your storyboard.</p>
              <p className="text-[11px] text-zinc-600 mt-1">Hold Ctrl/Cmd or Shift to multi-select before dragging.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 items-start content-start">
            {resolvedItems.map((r, idx) => (
              <div key={r.item.id} className="flex items-stretch">
                {/* Drop slot before this card — widens during drag for easier targeting */}
                <div
                  className={`rounded transition-all ${
                    isDragActive ? 'w-7 mx-0.5' : 'w-2'
                  } ${
                    dropTargetId === r.item.id
                      ? 'bg-blue-500/80'
                      : isDragActive
                        ? 'bg-blue-500/15 border border-dashed border-blue-500/50'
                        : 'bg-transparent'
                  }`}
                  style={{ minHeight: 130 }}
                  onDragOver={(e) => handleSlotDragOver(r.item.id, e)}
                  onDragLeave={handleSlotDragLeave}
                  onDrop={(e) => handleDrop(r.item.id, e)}
                />
                <StoryboardCard
                  resolved={r}
                  index={idx}
                  isDragging={draggingItemId === r.item.id}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(GRID_ITEM_DRAG_TYPE, r.item.id)
                    e.dataTransfer.effectAllowed = 'move'
                    setDraggingItemId(r.item.id)
                    setIsDragActive(true)
                  }}
                  onDragEnd={() => resetDragState()}
                  onCycleTake={(dir) => {
                    const total = r.asset.takes?.length ?? 0
                    if (total <= 1) return
                    const cur = r.effectiveTakeIndex ?? 0
                    const nextIdx = dir === 'next' ? (cur + 1) % total : (cur - 1 + total) % total
                    onSetItemTakeIndex(r.item.id, nextIdx)
                  }}
                  onClearTakeOverride={() => onSetItemTakeIndex(r.item.id, undefined)}
                  onRemove={() => onRemoveItem(r.item.id)}
                  onDoubleClick={onPreviewItem ? () => onPreviewItem(idx) : undefined}
                />
              </div>
            ))}
            {/* Trailing drop zone for appending */}
            <div
              className={`flex items-center justify-center rounded border-2 border-dashed transition-all ${
                isDragActive ? 'w-24' : 'w-12'
              } ${
                dropTargetId === 'end'
                  ? 'border-blue-500 bg-blue-500/20'
                  : isDragActive
                    ? 'border-blue-500/50 bg-blue-500/5'
                    : 'border-zinc-800'
              }`}
              style={{ minHeight: 130 }}
              onDragOver={(e) => handleSlotDragOver('end', e)}
              onDragLeave={handleSlotDragLeave}
              onDrop={(e) => handleDrop(null, e)}
            >
              <span className="text-[10px] text-zinc-500 whitespace-nowrap px-1">drop here</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
