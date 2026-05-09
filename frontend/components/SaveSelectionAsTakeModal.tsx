import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Layers, Loader2, Check, AlertCircle, FolderOpen, ChevronDown } from 'lucide-react'
import { Button } from './ui/button'
import { useSaveSelectionAsTakeModal } from '../views/editor/SaveSelectionAsTakeContext'
import {
  useTakeFolderExport,
  type TakeFolderListEntry,
  type TakeFolderTargetMode,
} from '../views/editor/useTakeFolderExport'

interface SaveSelectionAsTakeModalProps {
  projectId: string
}

const DEFAULT_FPS = 24
const DEFAULT_QUALITY = 18

function defaultFolderName(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `take-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  const total = Math.max(0, seconds)
  const mm = Math.floor(total / 60)
  const ss = total - mm * 60
  return `${mm}:${ss.toFixed(2).padStart(5, '0')}`
}

export function SaveSelectionAsTakeModal({ projectId }: SaveSelectionAsTakeModalProps) {
  const { isOpen, close: closeModal } = useSaveSelectionAsTakeModal()
  const {
    payload,
    status,
    error,
    resultFolderPath,
    listFolders,
    runExport,
    reset,
  } = useTakeFolderExport({ projectId })

  const [mode, setMode] = useState<TakeFolderTargetMode>('create')
  const [newFolderName, setNewFolderName] = useState(defaultFolderName)
  const [existingFolders, setExistingFolders] = useState<TakeFolderListEntry[]>([])
  const [selectedExisting, setSelectedExisting] = useState<string>('')
  const [label, setLabel] = useState('')

  const selectionSummary = useMemo(() => {
    if (!payload) return null
    return {
      clipCount: payload.expandedClipIds.length,
      duration: payload.selectionDuration,
      width: payload.inferredWidth,
      height: payload.inferredHeight,
    }
  }, [payload])

  // Reset form + reload folder list each time the modal opens.
  useEffect(() => {
    if (!isOpen) return
    reset()
    setMode('create')
    setNewFolderName(defaultFolderName())
    setLabel('')
    void listFolders().then(folders => {
      setExistingFolders(folders)
      setSelectedExisting(folders[0]?.name ?? '')
      // If there are no existing folders, lock to 'create'.
      if (folders.length === 0) setMode('create')
    })
  }, [isOpen, listFolders, reset])

  const close = useCallback(() => {
    if (status === 'rendering' || status === 'preparing' || status === 'finalizing') return
    closeModal()
    reset()
  }, [closeModal, reset, status])

  const handleSubmit = useCallback(async () => {
    if (!payload || !selectionSummary) return
    const folderName = mode === 'create' ? newFolderName.trim() : selectedExisting
    if (!folderName) return
    await runExport(
      {
        mode,
        folderName,
        label: label.trim() || undefined,
        codec: 'h264',
        fps: DEFAULT_FPS,
        quality: DEFAULT_QUALITY,
        width: selectionSummary.width,
        height: selectionSummary.height,
      },
      payload,
    )
  }, [label, mode, newFolderName, payload, runExport, selectedExisting, selectionSummary])

  const showInFolder = useCallback(() => {
    if (resultFolderPath) {
      window.electronAPI?.showItemInFolder({ filePath: resultFolderPath })
    }
  }, [resultFolderPath])

  if (!isOpen) return null

  const isWorking = status === 'preparing' || status === 'rendering' || status === 'finalizing'
  const canSubmit = !!payload
    && !isWorking
    && (mode === 'create'
      ? newFolderName.trim().length > 0
      : selectedExisting.length > 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={close}
    >
      <div
        className="bg-zinc-900 rounded-2xl border border-zinc-700/50 shadow-2xl w-full max-w-lg relative overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-400" />
            <h2 className="text-lg font-bold text-white">Save Selection as Take</h2>
          </div>
          <button
            onClick={close}
            disabled={isWorking}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {!payload && (
            <div className="text-sm text-zinc-400">
              Select one or more clips on the timeline to save them as a take.
            </div>
          )}

          {payload && selectionSummary && (
            <>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-400 space-y-1">
                <div className="flex justify-between">
                  <span>Clips</span>
                  <span className="text-zinc-200">{selectionSummary.clipCount}</span>
                </div>
                <div className="flex justify-between">
                  <span>Duration</span>
                  <span className="text-zinc-200">{formatDuration(selectionSummary.duration)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Output</span>
                  <span className="text-zinc-200">
                    {selectionSummary.width}x{selectionSummary.height} @ {DEFAULT_FPS}fps h264
                  </span>
                </div>
              </div>

              {status === 'idle' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">Target</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setMode('create')}
                        className={`p-2.5 rounded-lg border text-center transition-all ${
                          mode === 'create'
                            ? 'border-blue-500 bg-blue-500/10 text-white'
                            : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                        }`}
                      >
                        <p className="text-xs font-semibold">New folder</p>
                        <p className="text-[9px] text-zinc-500 mt-0.5">First take in a new takes folder</p>
                      </button>
                      <button
                        onClick={() => setMode('append')}
                        disabled={existingFolders.length === 0}
                        className={`p-2.5 rounded-lg border text-center transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                          mode === 'append'
                            ? 'border-blue-500 bg-blue-500/10 text-white'
                            : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                        }`}
                      >
                        <p className="text-xs font-semibold">Append variant</p>
                        <p className="text-[9px] text-zinc-500 mt-0.5">
                          {existingFolders.length === 0
                            ? 'No existing folders yet'
                            : 'Add to an existing takes folder'}
                        </p>
                      </button>
                    </div>
                  </div>

                  {mode === 'create' && (
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1.5 block">
                        Folder name
                      </label>
                      <input
                        type="text"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                        placeholder="take-..."
                      />
                    </div>
                  )}

                  {mode === 'append' && existingFolders.length > 0 && (
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1.5 block">
                        Existing folder
                      </label>
                      <div className="relative">
                        <select
                          value={selectedExisting}
                          onChange={(e) => setSelectedExisting(e.target.value)}
                          className="w-full appearance-none bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 pr-8 cursor-pointer"
                        >
                          {existingFolders.map((folder) => (
                            <option key={folder.name} value={folder.name}>
                              {folder.name} — {folder.takeCount} take{folder.takeCount === 1 ? '' : 's'}
                              {folder.baseDuration !== null ? `, ${formatDuration(folder.baseDuration)}` : ''}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                      </div>
                      <p className="text-[10px] text-zinc-500 mt-1.5">
                        New variants must match the folder's base duration within one frame.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1.5 block">
                      Label <span className="text-zinc-600 normal-case">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                      placeholder="e.g. cooler grade, alt take"
                    />
                  </div>

                  <button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
                  >
                    <Layers className="h-4 w-4" />
                    {mode === 'create' ? 'Create Takes Folder' : 'Add Variant'}
                  </button>
                </>
              )}

              {isWorking && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                    <span className="text-sm text-zinc-300">
                      {status === 'preparing' && 'Preparing folder...'}
                      {status === 'rendering' && 'Rendering take...'}
                      {status === 'finalizing' && 'Writing manifest...'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    The export uses ffmpeg and may take a moment for longer selections.
                  </p>
                </div>
              )}

              {status === 'done' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                      <Check className="h-5 w-5 text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm text-white font-medium">Take saved</p>
                      <p className="text-xs text-zinc-500 truncate max-w-[340px]">{resultFolderPath}</p>
                      <p className="text-xs text-zinc-500">
                        Selection replaced with the new take. Use the take menu on the clip to switch variants.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {resultFolderPath && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-zinc-700 text-zinc-300"
                        onClick={showInFolder}
                      >
                        <FolderOpen className="h-4 w-4 mr-2" />
                        Show Folder
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-zinc-700 text-zinc-300"
                      onClick={close}
                    >
                      Done
                    </Button>
                  </div>
                </div>
              )}

              {status === 'error' && (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="h-5 w-5 text-red-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium">Export failed</p>
                      <p className="text-xs text-red-400 break-words">{error}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-zinc-700 text-zinc-300"
                    onClick={reset}
                  >
                    Try Again
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
