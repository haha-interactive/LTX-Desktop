import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Camera, Loader2, Check, AlertCircle, FolderOpen, AlertTriangle } from 'lucide-react'
import { Button } from './ui/button'
import { useExportClipFramesModal } from '../views/editor/ExportClipFramesContext'
import {
  useClipFrameExport,
  type FrameMode,
  type FrameKind,
  type FrameCollisionMode,
  type FrameExportRequestEntry,
} from '../views/editor/useClipFrameExport'

interface ExportClipFramesModalProps {
  projectId: string
}

const FILE_EXT = '.png'
const PREFIX_MAX = 60
const ALLOWED_RE = /^[^\\/<>:"|?*\x00-\x1f]+$/

function sanitizeForFilename(raw: string): string {
  return raw.replace(/[\\/<>:"|?*\x00-\x1f]/g, '_')
}

function defaultPrefix(label: string): string {
  const base = sanitizeForFilename(label).trim() || 'frame'
  return base.slice(0, PREFIX_MAX).replace(/\s+/g, '_')
}

function formatSeconds(s: number): string {
  if (!Number.isFinite(s)) return '—'
  const total = Math.max(0, s)
  return `${total.toFixed(2)}s`
}

interface PreviewState {
  exists: boolean
  fullPath: string
  autoSuffixedName: string
  autoSuffixedFullPath: string
}

export function ExportClipFramesModal({ projectId }: ExportClipFramesModalProps) {
  const { isOpen, close: closeModal } = useExportClipFramesModal()
  const {
    target,
    status,
    error,
    results,
    reset,
    runExport,
    checkTarget,
  } = useClipFrameExport({ projectId })

  const [mode, setMode] = useState<FrameMode>('both')
  const [prefix, setPrefix] = useState('')
  const [startSuffix, setStartSuffix] = useState('_start_frame')
  const [endSuffix, setEndSuffix] = useState('_end_frame')
  // Per-kind collision choice; only meaningful when the corresponding preview reports `exists`.
  const [startCollision, setStartCollision] = useState<FrameCollisionMode>('auto-suffix')
  const [endCollision, setEndCollision] = useState<FrameCollisionMode>('auto-suffix')
  const [startPreview, setStartPreview] = useState<PreviewState | null>(null)
  const [endPreview, setEndPreview] = useState<PreviewState | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Reset form whenever the modal opens or the selected clip changes.
  useEffect(() => {
    if (!isOpen) return
    reset()
    if (target) {
      setPrefix(defaultPrefix(target.displayLabel))
    } else {
      setPrefix('')
    }
    setMode('both')
    setStartSuffix('_start_frame')
    setEndSuffix('_end_frame')
    setStartCollision('auto-suffix')
    setEndCollision('auto-suffix')
    setStartPreview(null)
    setEndPreview(null)
    setValidationError(null)
  }, [isOpen, target?.clipId, reset])

  const startFilename = useMemo(() => `${prefix}${startSuffix}${FILE_EXT}`, [prefix, startSuffix])
  const endFilename = useMemo(() => `${prefix}${endSuffix}${FILE_EXT}`, [prefix, endSuffix])

  const includeStart = mode === 'start' || mode === 'both'
  const includeEnd = mode === 'end' || mode === 'both'

  // Validate prefix/suffix client-side.
  useEffect(() => {
    if (!isOpen) return
    if (!prefix.trim()) {
      setValidationError('Prefix cannot be empty')
      return
    }
    if (!ALLOWED_RE.test(prefix)) {
      setValidationError('Prefix contains invalid characters')
      return
    }
    if (includeStart && !ALLOWED_RE.test(startSuffix)) {
      setValidationError('Start suffix contains invalid characters')
      return
    }
    if (includeEnd && !ALLOWED_RE.test(endSuffix)) {
      setValidationError('End suffix contains invalid characters')
      return
    }
    if (includeStart && includeEnd && startSuffix === endSuffix) {
      setValidationError('Start and end suffix must be different')
      return
    }
    setValidationError(null)
  }, [prefix, startSuffix, endSuffix, includeStart, includeEnd, isOpen])

  // Debounce-check existence whenever filenames change.
  useEffect(() => {
    if (!isOpen || validationError) {
      setStartPreview(null)
      setEndPreview(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      const [s, e] = await Promise.all([
        includeStart ? checkTarget(startFilename) : Promise.resolve(null),
        includeEnd ? checkTarget(endFilename) : Promise.resolve(null),
      ])
      if (cancelled) return
      setStartPreview(s)
      setEndPreview(e)
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isOpen, includeStart, includeEnd, startFilename, endFilename, validationError, checkTarget])

  const close = useCallback(() => {
    if (status === 'exporting') return
    closeModal()
    reset()
  }, [closeModal, reset, status])

  const handleSubmit = useCallback(async () => {
    if (!target || validationError) return
    const entries: FrameExportRequestEntry[] = []
    if (includeStart) {
      entries.push({
        kind: 'start',
        filename: startFilename,
        seekTime: target.startSeekTime,
        collisionMode: startPreview?.exists ? startCollision : 'auto-suffix',
      })
    }
    if (includeEnd) {
      entries.push({
        kind: 'end',
        filename: endFilename,
        seekTime: target.endSeekTime,
        collisionMode: endPreview?.exists ? endCollision : 'auto-suffix',
      })
    }
    if (entries.length === 0) return
    await runExport(target.videoPath, entries)
  }, [
    target,
    validationError,
    includeStart,
    includeEnd,
    startFilename,
    endFilename,
    startPreview?.exists,
    endPreview?.exists,
    startCollision,
    endCollision,
    runExport,
  ])

  const showInFolder = useCallback((p: string) => {
    window.electronAPI?.showItemInFolder({ filePath: p })
  }, [])

  if (!isOpen) return null

  const isWorking = status === 'exporting'
  const canSubmit = !!target
    && !isWorking
    && !validationError
    && (includeStart || includeEnd)

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
            <Camera className="h-4 w-4 text-blue-400" />
            <h2 className="text-lg font-bold text-white">Export Clip Frames</h2>
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
          {!target && (
            <div className="text-sm text-zinc-400">
              Select exactly one video clip on the timeline to export its frames.
            </div>
          )}

          {target && !target.isVideo && (
            <div className="text-sm text-amber-400">
              The selected clip is not a video. Only video clips support frame export.
            </div>
          )}

          {target && target.isVideo && (
            <>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-400 space-y-1">
                <div className="flex justify-between">
                  <span>Clip</span>
                  <span className="text-zinc-200 truncate ml-3 max-w-[260px]" title={target.displayLabel}>
                    {target.displayLabel}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Start frame (source)</span>
                  <span className="text-zinc-200">{formatSeconds(target.startSeekTime)}</span>
                </div>
                <div className="flex justify-between">
                  <span>End frame (source)</span>
                  <span className="text-zinc-200">{formatSeconds(target.endSeekTime)}</span>
                </div>
              </div>

              {status === 'idle' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">
                      Frames to export
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['start', 'end', 'both'] as FrameMode[]).map((m) => (
                        <button
                          key={m}
                          onClick={() => setMode(m)}
                          className={`p-2.5 rounded-lg border text-center transition-all ${
                            mode === m
                              ? 'border-blue-500 bg-blue-500/10 text-white'
                              : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                          }`}
                        >
                          <p className="text-xs font-semibold">
                            {m === 'start' ? 'Start only' : m === 'end' ? 'End only' : 'Both'}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1.5 block">
                      Filename prefix
                    </label>
                    <input
                      type="text"
                      value={prefix}
                      onChange={(e) => setPrefix(e.target.value)}
                      maxLength={PREFIX_MAX}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                      placeholder="clip-name"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1.5 block">
                        Start suffix
                      </label>
                      <input
                        type="text"
                        value={startSuffix}
                        onChange={(e) => setStartSuffix(e.target.value)}
                        disabled={!includeStart}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-40"
                        placeholder="_start_frame"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1.5 block">
                        End suffix
                      </label>
                      <input
                        type="text"
                        value={endSuffix}
                        onChange={(e) => setEndSuffix(e.target.value)}
                        disabled={!includeEnd}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-40"
                        placeholder="_end_frame"
                      />
                    </div>
                  </div>

                  {validationError && (
                    <div className="text-xs text-red-400">{validationError}</div>
                  )}

                  <div className="space-y-2">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">
                      Will save to
                    </label>
                    {includeStart && (
                      <FrameTargetRow
                        kind="start"
                        filename={startFilename}
                        preview={startPreview}
                        collisionMode={startCollision}
                        onCollisionModeChange={setStartCollision}
                      />
                    )}
                    {includeEnd && (
                      <FrameTargetRow
                        kind="end"
                        filename={endFilename}
                        preview={endPreview}
                        collisionMode={endCollision}
                        onCollisionModeChange={setEndCollision}
                      />
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 border-zinc-700 text-zinc-300"
                      onClick={close}
                    >
                      Cancel
                    </Button>
                    <button
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                      className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
                    >
                      <Camera className="h-4 w-4" />
                      Export
                    </button>
                  </div>
                </>
              )}

              {isWorking && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                    <span className="text-sm text-zinc-300">Extracting frame…</span>
                  </div>
                </div>
              )}

              {status === 'done' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                      <Check className="h-5 w-5 text-green-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-white font-medium">
                        {results.length === 1 ? 'Frame exported' : 'Frames exported'}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {results.map((r) => (
                      <div
                        key={r.kind}
                        className="flex items-center gap-2 text-xs text-zinc-400"
                      >
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-semibold uppercase tracking-wider text-[9px]">
                          {r.kind}
                        </span>
                        <span className="truncate flex-1" title={r.outputPath}>{r.outputPath}</span>
                        <button
                          onClick={() => showInFolder(r.outputPath)}
                          className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
                          title="Reveal in folder"
                        >
                          <FolderOpen className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
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

interface FrameTargetRowProps {
  kind: FrameKind
  filename: string
  preview: PreviewState | null
  collisionMode: FrameCollisionMode
  onCollisionModeChange: (mode: FrameCollisionMode) => void
}

function FrameTargetRow({
  kind,
  filename,
  preview,
  collisionMode,
  onCollisionModeChange,
}: FrameTargetRowProps) {
  const finalPath = preview
    ? (preview.exists && collisionMode === 'auto-suffix'
        ? preview.autoSuffixedFullPath
        : preview.fullPath)
    : null

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-2.5 space-y-1.5">
      <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[9px]">{kind}</span>
        <span>{filename}</span>
      </div>
      <div className="text-[11px] text-zinc-400 break-all font-mono">
        {finalPath ?? '…resolving path'}
      </div>
      {preview?.exists && (
        <div className="rounded-md border border-amber-700/40 bg-amber-900/10 p-2 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] text-amber-300">
            <AlertTriangle className="h-3 w-3" />
            <span>A file with this name already exists.</span>
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
              <input
                type="radio"
                name={`collision-${kind}`}
                checked={collisionMode === 'auto-suffix'}
                onChange={() => onCollisionModeChange('auto-suffix')}
              />
              <span>
                Save as <span className="font-mono text-zinc-400">{preview.autoSuffixedName}</span> (don't overwrite)
              </span>
            </label>
            <label className="flex items-center gap-2 text-[11px] text-zinc-300 cursor-pointer">
              <input
                type="radio"
                name={`collision-${kind}`}
                checked={collisionMode === 'overwrite'}
                onChange={() => onCollisionModeChange('overwrite')}
              />
              <span>Overwrite existing file</span>
            </label>
            <p className="text-[10px] text-zinc-500">
              Or edit the prefix/suffix above to pick a different name.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
