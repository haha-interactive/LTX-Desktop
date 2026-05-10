import { useCallback, useEffect, useMemo } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Project } from '../../types/project-model'
import { pathToFileUrl } from '../../lib/file-url'
import { resolveStoryboardItem, type ResolvedStoryboardItem } from './storyboard-utils'
import type { StoryboardItem } from '../../lib/storyboard-storage'

interface StoryboardPreviewModalProps {
  project: Project
  items: StoryboardItem[]
  index: number
  onClose: () => void
  onIndexChange: (next: number) => void
  title?: string
}

function takeSrc(resolved: ResolvedStoryboardItem): string {
  const path = resolved.take?.path ?? resolved.asset.path
  const cache = resolved.take?.createdAt ?? resolved.asset.createdAt
  const url = pathToFileUrl(path)
  return cache ? `${url}?v=${cache}` : url
}

export function StoryboardPreviewModal({
  project,
  items,
  index,
  onClose,
  onIndexChange,
  title,
}: StoryboardPreviewModalProps) {
  const resolved = useMemo(() => {
    const item = items[index]
    if (!item) return null
    return resolveStoryboardItem(item, project)
  }, [items, index, project])

  const total = items.length

  const goPrev = useCallback(() => {
    if (total === 0) return
    onIndexChange((index - 1 + total) % total)
  }, [index, onIndexChange, total])

  const goNext = useCallback(() => {
    if (total === 0) return
    onIndexChange((index + 1) % total)
  }, [index, onIndexChange, total])

  // Keyboard nav: Esc closes, Left/Right cycles.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, goPrev, goNext])

  if (!resolved) return null

  const isImage = resolved.asset.type === 'image'
  const src = takeSrc(resolved)
  const labelSuffix = resolved.take?.label ? ` · ${resolved.take.label}` : ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        className="relative max-w-[min(1200px,90vw)] w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="min-w-0">
            <p className="text-sm text-white font-medium truncate">{title ?? resolved.displayName}</p>
            <p className="text-[11px] text-zinc-400 truncate">
              {resolved.asset.type}
              {labelSuffix}
              {' · '}{resolved.duration.toFixed(1)}s
              {total > 1 && <> · {index + 1} / {total}</>}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors flex-shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative bg-black rounded-xl overflow-hidden flex items-center justify-center" style={{ maxHeight: '80vh' }}>
          {isImage ? (
            <img
              key={src}
              src={src}
              alt=""
              className="max-h-[80vh] w-auto object-contain"
            />
          ) : (
            <video
              key={src}
              src={src}
              autoPlay
              controls
              className="max-h-[80vh] w-auto"
            />
          )}

          {total > 1 && (
            <>
              <button
                onClick={goPrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
                title="Previous (←)"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={goNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
                title="Next (→)"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
