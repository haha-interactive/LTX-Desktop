import { useCallback, useMemo, useRef, useState } from 'react'
import { Search, Image as ImageIcon, Film, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Asset } from '../../types/project-model'
import { pathToFileUrl } from '../../lib/file-url'
import { useProjects } from '../../contexts/ProjectContext'

export const SB_DRAG_TYPE = 'storyboard/asset-ids'

interface StoryboardSidebarProps {
  projectId: string
  assets: Asset[]
  onPreviewAsset?: (assetIds: string[], index: number) => void
}

function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return '—'
  const total = Math.max(0, seconds)
  return `${total.toFixed(1)}s`
}

function assetDisplayName(asset: Asset): string {
  const trimmed = asset.prompt?.trim()
  if (trimmed) return trimmed
  const fileName = asset.path.split(/[\\/]/).pop()
  return fileName || 'Untitled'
}

function activeTakeOf(asset: Asset) {
  if (!asset.takes || asset.takes.length === 0) return null
  const idx = asset.activeTakeIndex ?? 0
  const clamped = Math.max(0, Math.min(idx, asset.takes.length - 1))
  return { take: asset.takes[clamped], idx: clamped, total: asset.takes.length }
}

export function StoryboardSidebar({ projectId, assets, onPreviewAsset }: StoryboardSidebarProps) {
  const { setAssetActiveTake } = useProjects()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const lastClickedRef = useRef<string | null>(null)

  const sortedFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return assets
      .filter(a => a.type === 'image' || a.type === 'video')
      .filter(a => !q || (assetDisplayName(a).toLowerCase().includes(q)))
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [assets, search])

  const handleClick = useCallback((assetId: string, e: React.MouseEvent) => {
    const isMod = e.ctrlKey || e.metaKey
    const isShift = e.shiftKey
    setSelected(prev => {
      const next = new Set(prev)
      if (isShift && lastClickedRef.current) {
        // range select between lastClicked and assetId
        const ids = sortedFiltered.map(a => a.id)
        const a = ids.indexOf(lastClickedRef.current)
        const b = ids.indexOf(assetId)
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a]
          for (let i = lo; i <= hi; i += 1) next.add(ids[i])
          return next
        }
      }
      if (isMod) {
        if (next.has(assetId)) next.delete(assetId)
        else next.add(assetId)
      } else {
        next.clear()
        next.add(assetId)
      }
      return next
    })
    lastClickedRef.current = assetId
  }, [sortedFiltered])

  const handleDragStart = useCallback((assetId: string, e: React.DragEvent<HTMLDivElement>) => {
    // If the dragged card is part of the selection, drag the whole selection.
    const ids = selected.has(assetId)
      ? sortedFiltered.filter(a => selected.has(a.id)).map(a => a.id)
      : [assetId]
    e.dataTransfer.setData(SB_DRAG_TYPE, JSON.stringify(ids))
    e.dataTransfer.effectAllowed = 'copy'
  }, [selected, sortedFiltered])

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    lastClickedRef.current = null
  }, [])

  const cycleAssetTake = useCallback((asset: Asset, dir: 'prev' | 'next') => {
    if (!asset.takes || asset.takes.length === 0) return
    const cur = asset.activeTakeIndex ?? 0
    const total = asset.takes.length
    const nextIdx = dir === 'next' ? (cur + 1) % total : (cur - 1 + total) % total
    setAssetActiveTake(projectId, asset.id, nextIdx)
  }, [projectId, setAssetActiveTake])

  return (
    <aside
      className="w-72 border-r border-zinc-800 flex flex-col flex-shrink-0 bg-background"
      onClick={(e) => {
        // Click in empty sidebar area clears selection.
        if (e.target === e.currentTarget) clearSelection()
      }}
    >
      <div className="px-3 py-3 border-b border-zinc-800 flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search assets..."
          className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 focus:outline-none"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {sortedFiltered.length === 0 ? (
          <div className="text-xs text-zinc-500 px-2 py-3">
            {search ? 'No matches.' : 'No image or video assets in this project yet.'}
          </div>
        ) : (
          sortedFiltered.map(asset => {
            const isSelected = selected.has(asset.id)
            const active = activeTakeOf(asset)
            const thumbPath = active?.take.smallThumbnailPath ?? asset.smallThumbnailPath
            const cacheBust = active?.take.createdAt
            const thumbUrl = thumbPath
              ? `${pathToFileUrl(thumbPath)}${cacheBust ? `?v=${cacheBust}` : ''}`
              : null
            return (
              <div
                key={asset.id}
                draggable
                onDragStart={(e) => handleDragStart(asset.id, e)}
                onClick={(e) => handleClick(asset.id, e)}
                onDoubleClick={() => {
                  if (!onPreviewAsset) return
                  const ids = sortedFiltered.map(a => a.id)
                  const idx = ids.indexOf(asset.id)
                  if (idx >= 0) onPreviewAsset(ids, idx)
                }}
                className={`flex items-center gap-2 p-1.5 rounded-md border cursor-grab active:cursor-grabbing transition-colors ${
                  isSelected
                    ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/40'
                    : 'border-zinc-800 hover:bg-zinc-900'
                }`}
                title={onPreviewAsset ? 'Double-click to preview' : undefined}
              >
                <div className="w-12 aspect-video bg-zinc-800 rounded flex-shrink-0 overflow-hidden">
                  {thumbUrl ? (
                    <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                  ) : asset.type === 'image' ? (
                    <ImageIcon className="w-full h-full p-2 text-zinc-600" />
                  ) : (
                    <Film className="w-full h-full p-2 text-zinc-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate">{assetDisplayName(asset)}</p>
                  <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                    <span>{formatDuration(asset.duration)}</span>
                    {active && active.total > 1 && (
                      <span className="flex items-center gap-0.5 ml-auto">
                        <button
                          onClick={(e) => { e.stopPropagation(); cycleAssetTake(asset, 'prev') }}
                          className="p-0.5 rounded hover:bg-zinc-700 text-zinc-400"
                          title="Previous take"
                        >
                          <ChevronLeft className="h-2.5 w-2.5" />
                        </button>
                        <span className="text-zinc-400 tabular-nums">{active.idx + 1}/{active.total}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); cycleAssetTake(asset, 'next') }}
                          className="p-0.5 rounded hover:bg-zinc-700 text-zinc-400"
                          title="Next take"
                        >
                          <ChevronRight className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
      {selected.size > 0 && (
        <div className="px-3 py-2 border-t border-zinc-800 text-[11px] text-zinc-400 flex items-center justify-between">
          <span>{selected.size} selected</span>
          <button
            onClick={clearSelection}
            className="text-zinc-500 hover:text-zinc-300"
          >
            Clear
          </button>
        </div>
      )}
    </aside>
  )
}
