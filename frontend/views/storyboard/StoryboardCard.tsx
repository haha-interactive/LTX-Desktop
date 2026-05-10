import { ChevronLeft, ChevronRight, X, Image as ImageIcon, Film } from 'lucide-react'
import type { ResolvedStoryboardItem } from './storyboard-utils'
import { pathToFileUrl } from '../../lib/file-url'

interface StoryboardCardProps {
  resolved: ResolvedStoryboardItem
  index: number
  isDragging: boolean
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void
  onDragEnd: () => void
  onCycleTake: (dir: 'prev' | 'next') => void
  onClearTakeOverride: () => void
  onRemove: () => void
  onDoubleClick?: () => void
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  return `${Math.max(0, seconds).toFixed(1)}s`
}

export function StoryboardCard({
  resolved,
  index,
  isDragging,
  onDragStart,
  onDragEnd,
  onCycleTake,
  onClearTakeOverride,
  onRemove,
  onDoubleClick,
}: StoryboardCardProps) {
  const { item, asset, take, effectiveTakeIndex, duration, thumbnailPath, displayName } = resolved
  const totalTakes = asset.takes?.length ?? 0
  const cacheBust = take?.createdAt
  const thumbUrl = thumbnailPath
    ? `${pathToFileUrl(thumbnailPath)}${cacheBust ? `?v=${cacheBust}` : ''}`
    : null

  const isOverride = item.takeIndex !== undefined

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDoubleClick={onDoubleClick}
      className={`group relative flex flex-col rounded-lg border overflow-hidden cursor-grab active:cursor-grabbing transition-opacity ${
        isDragging ? 'opacity-40 border-blue-500' : 'border-zinc-800 bg-zinc-900/50'
      }`}
      style={{ width: 200 }}
      title={onDoubleClick ? 'Double-click to preview' : undefined}
    >
      <div className="aspect-video bg-zinc-950 relative">
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {asset.type === 'image' ? (
              <ImageIcon className="h-8 w-8 text-zinc-700" />
            ) : (
              <Film className="h-8 w-8 text-zinc-700" />
            )}
          </div>
        )}
        <div className="absolute top-1 left-1 bg-black/70 text-white rounded px-1.5 py-0.5 text-[10px] font-bold">
          {index + 1}
        </div>
        <button
          onClick={onRemove}
          className="absolute top-1 right-1 w-6 h-6 rounded bg-black/70 hover:bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          title="Remove from storyboard"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-2 py-1.5 space-y-1">
        <p className="text-xs text-zinc-200 truncate" title={displayName}>{displayName}</p>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-zinc-400">{formatDuration(duration)}</span>
          {totalTakes > 1 && (
            <span className="flex items-center gap-0.5">
              <button
                onClick={() => onCycleTake('prev')}
                className="p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                title="Previous take"
              >
                <ChevronLeft className="h-2.5 w-2.5" />
              </button>
              <button
                onClick={isOverride ? onClearTakeOverride : undefined}
                className={`tabular-nums px-1 ${
                  isOverride ? 'text-blue-300 font-medium hover:underline' : 'text-zinc-400'
                }`}
                title={isOverride ? 'Per-item override (click to clear)' : 'Asset default take'}
              >
                {(effectiveTakeIndex ?? 0) + 1}/{totalTakes}
              </button>
              <button
                onClick={() => onCycleTake('next')}
                className="p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300"
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
}
