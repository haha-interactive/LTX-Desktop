import { Layers, Film } from 'lucide-react'
import type { TakeFolderListEntry } from './useTakesTabData'

interface TakeFolderCardProps {
  folder: TakeFolderListEntry
  selected: boolean
  onSelect: () => void
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—'
  const total = Math.max(0, seconds)
  const mm = Math.floor(total / 60)
  const ss = total - mm * 60
  return `${mm}:${ss.toFixed(1).padStart(4, '0')}`
}

export function TakeFolderCard({ folder, selected, onSelect }: TakeFolderCardProps) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
        selected
          ? 'border-blue-500 bg-blue-500/10 text-white'
          : 'border-zinc-800 bg-zinc-900/50 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/50'
      }`}
    >
      <div className="w-9 h-9 rounded bg-zinc-800 flex items-center justify-center flex-shrink-0">
        <Layers className="h-4 w-4 text-zinc-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{folder.name}</p>
        <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-0.5">
          <span className="flex items-center gap-1">
            <Film className="h-3 w-3" />
            {folder.takeCount} take{folder.takeCount === 1 ? '' : 's'}
          </span>
          <span>·</span>
          <span>{formatDuration(folder.baseDuration)}</span>
        </div>
      </div>
    </button>
  )
}
