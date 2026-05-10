import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, Plus, Loader2, AlertCircle, Upload, Scissors, Play, Pause } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { pathToFileUrl } from '../../lib/file-url'

interface AddTakeDialogProps {
  baseDuration: number
  onClose: () => void
  onConfirm: (
    srcPath: string,
    metadata: { label?: string; prompt?: string; platform?: string },
    trim?: { startSeconds: number; durationSeconds: number },
  ) => Promise<{ ok: true } | { ok: false; error: string }>
}

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi']
const DURATION_EPSILON = 1 / 24

type SrcStatus =
  | { kind: 'idle' }
  | { kind: 'probing' }
  | { kind: 'match'; duration: number }
  | { kind: 'too-short'; duration: number }
  | { kind: 'too-long'; duration: number }
  | { kind: 'probe-failed'; error: string }

function formatSeconds(s: number): string {
  if (!Number.isFinite(s)) return '—'
  const total = Math.max(0, s)
  return `${total.toFixed(2)}s`
}

export function AddTakeDialog({
  baseDuration,
  onClose,
  onConfirm,
}: AddTakeDialogProps) {
  const [srcPath, setSrcPath] = useState<string>('')
  const [srcStatus, setSrcStatus] = useState<SrcStatus>({ kind: 'idle' })
  const [trimStart, setTrimStart] = useState(0)
  const [label, setLabel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [platform, setPlatform] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(true)
  const [previewFailed, setPreviewFailed] = useState(false)
  const [playheadPct, setPlayheadPct] = useState(0)
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  // Probe duration whenever srcPath changes via the picker.
  const probeSrc = useCallback(async (filePath: string) => {
    const api = window.electronAPI
    if (!api) return
    setSrcStatus({ kind: 'probing' })
    setTrimStart(0)
    setError(null)
    setPreviewFailed(false)
    const result = await api.probeVideoDuration({ srcVideoPath: filePath })
    if (!result.success) {
      setSrcStatus({ kind: 'probe-failed', error: result.error })
      return
    }
    const d = result.durationSeconds
    if (Math.abs(d - baseDuration) <= DURATION_EPSILON) {
      setSrcStatus({ kind: 'match', duration: d })
    } else if (d < baseDuration - DURATION_EPSILON) {
      setSrcStatus({ kind: 'too-short', duration: d })
    } else {
      setSrcStatus({ kind: 'too-long', duration: d })
    }
  }, [baseDuration])

  const pickFile = useCallback(async () => {
    const api = window.electronAPI
    if (!api) return
    const paths = await api.showOpenFileDialog({
      title: 'Select video to add as new take',
      filters: [
        { name: 'Video', extensions: VIDEO_EXTENSIONS },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    })
    if (paths && paths.length > 0) {
      setSrcPath(paths[0])
      void probeSrc(paths[0])
    }
  }, [probeSrc])

  // For too-long sources: wire the <video> element to loop strictly inside
  // [trimStart, trimStart + baseDuration]. On every timeupdate we check the
  // bound and seek back to trimStart if the playhead has crossed the end.
  // When the trim window changes, jump to the new start.
  const isTrimming = srcStatus.kind === 'too-long'
  const srcDuration = srcStatus.kind === 'match' || srcStatus.kind === 'too-short' || srcStatus.kind === 'too-long'
    ? srcStatus.duration
    : 0
  const maxStart = Math.max(0, srcDuration - baseDuration)
  const trimEnd = Math.min(srcDuration, trimStart + baseDuration)

  useEffect(() => {
    const v = videoRef.current
    if (!v || !isTrimming) return
    // When the user moves the slider, snap playback back to the new trim start.
    if (v.currentTime < trimStart || v.currentTime >= trimEnd - 0.02) {
      try { v.currentTime = trimStart } catch { /* ignore */ }
    }
  }, [trimStart, trimEnd, isTrimming])

  const handleTimeUpdate = useCallback(() => {
    const v = videoRef.current
    if (!v || !isTrimming) return
    if (v.currentTime >= trimEnd - 0.02) {
      try { v.currentTime = trimStart } catch { /* ignore */ }
    } else if (v.currentTime < trimStart - 0.05) {
      try { v.currentTime = trimStart } catch { /* ignore */ }
    }
  }, [isTrimming, trimEnd, trimStart])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      v.currentTime = Math.max(trimStart, Math.min(trimEnd - 0.05, v.currentTime))
      void v.play().catch(() => {})
    } else {
      v.pause()
    }
  }, [trimStart, trimEnd])

  // Drive a white playhead across the trim track at requestAnimationFrame
  // cadence (smooth) instead of <video>'s onTimeUpdate (~250ms, choppy).
  // Runs only while the source is too-long (trimming UI is mounted) and the
  // video is playing.
  useEffect(() => {
    if (!isTrimming || srcDuration <= 0 || !isPlaying || previewFailed) return
    let raf = 0
    const tick = () => {
      const v = videoRef.current
      if (v) setPlayheadPct(Math.max(0, Math.min(1, v.currentTime / srcDuration)))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { if (raf) cancelAnimationFrame(raf) }
  }, [isTrimming, srcDuration, isPlaying, previewFailed])

  // When trimStart changes (drag, or loop snap), jump the white playhead
  // back instantly without waiting for the next rAF/timeupdate.
  useEffect(() => {
    if (srcDuration > 0) setPlayheadPct(trimStart / srcDuration)
  }, [trimStart, srcDuration])

  // Pointer-driven drag of the red start handle. Translate clientX → time
  // and clamp to [0, maxStart].
  const handleRedPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const track = trackRef.current
    if (!track || srcDuration <= 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    draggingRef.current = true
  }, [srcDuration])

  const handleRedPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    const track = trackRef.current
    if (!track || srcDuration <= 0) return
    const rect = track.getBoundingClientRect()
    if (rect.width <= 0) return
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const next = Math.max(0, Math.min(maxStart, pct * srcDuration))
    setTrimStart(next)
  }, [maxStart, srcDuration])

  const handleRedPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!srcPath || submitting) return
    if (srcStatus.kind === 'too-short') return
    if (srcStatus.kind === 'probe-failed') return
    setSubmitting(true)
    setError(null)
    const trim = srcStatus.kind === 'too-long'
      ? { startSeconds: trimStart, durationSeconds: baseDuration }
      : undefined
    const result = await onConfirm(
      srcPath,
      {
        label: label.trim() || undefined,
        prompt: prompt.trim() || undefined,
        platform: platform.trim() || undefined,
      },
      trim,
    )
    setSubmitting(false)
    if (result.ok) {
      onClose()
    } else {
      setError(result.error)
    }
  }, [baseDuration, label, onClose, onConfirm, platform, prompt, srcPath, srcStatus.kind, submitting, trimStart])

  const close = useCallback(() => {
    if (submitting) return
    onClose()
  }, [onClose, submitting])

  const filenameBase = srcPath ? srcPath.split(/[\\/]/).pop() ?? '' : ''

  const isDurationError = !!error && /duration/i.test(error)
  const calloutTone = useMemo(() => {
    if (srcStatus.kind === 'too-short' || srcStatus.kind === 'too-long' || isDurationError) return 'red'
    if (srcStatus.kind === 'match') return 'green'
    return 'neutral'
  }, [srcStatus.kind, isDurationError])

  const trimSrcUrl = isTrimming ? pathToFileUrl(srcPath) : null
  const submitDisabled = !srcPath
    || !label.trim()
    || submitting
    || srcStatus.kind === 'probing'
    || srcStatus.kind === 'too-short'
    || srcStatus.kind === 'probe-failed'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={close}
    >
      <div
        className={`bg-zinc-900 rounded-2xl border border-zinc-700/50 shadow-2xl w-full ${isTrimming ? 'max-w-2xl' : 'max-w-md'} relative overflow-hidden flex flex-col max-h-[calc(100vh-2rem)]`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-blue-400" />
            <h2 className="text-base font-semibold text-white">Add take</h2>
          </div>
          <button
            onClick={close}
            disabled={submitting}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div
            className={`rounded-lg border p-3 text-xs transition-colors ${
              calloutTone === 'red'
                ? 'border-red-500/40 bg-red-500/10 text-red-200'
                : calloutTone === 'green'
                  ? 'border-green-500/40 bg-green-500/10 text-green-200'
                  : 'border-zinc-800 bg-zinc-950/50 text-zinc-400'
            }`}
          >
            <div className="flex justify-between">
              <span className={calloutTone === 'red' ? 'text-red-300' : calloutTone === 'green' ? 'text-green-300' : 'text-zinc-300'}>
                Required duration
              </span>
              <span className="font-semibold">~{baseDuration.toFixed(2)}s (within 1 frame)</span>
            </div>
            {srcStatus.kind === 'match' && (
              <p className="text-[10px] mt-1 text-green-300/80">
                Source duration matches — ready to add.
              </p>
            )}
            {srcStatus.kind === 'too-short' && (
              <p className="text-[10px] mt-1 text-red-300/80">
                Source video is {formatSeconds(srcStatus.duration)} — shorter than required. Pick a longer file.
              </p>
            )}
            {srcStatus.kind === 'too-long' && (
              <p className="text-[10px] mt-1 text-red-300/80">
                Source video is {formatSeconds(srcStatus.duration)} — longer than required. Drag the trim slider below to pick the {baseDuration.toFixed(2)}s segment to keep.
              </p>
            )}
            {srcStatus.kind === 'idle' && (
              <p className="text-[10px] mt-1 text-zinc-500">
                The new video must match the folder's base duration. Longer videos can be trimmed; shorter videos are rejected.
              </p>
            )}
            {srcStatus.kind === 'probing' && (
              <p className="text-[10px] mt-1 text-zinc-400 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Probing duration...
              </p>
            )}
            {srcStatus.kind === 'probe-failed' && (
              <p className="text-[10px] mt-1 text-red-300/80">
                Could not probe duration: {srcStatus.error}
              </p>
            )}
          </div>

          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1 block">Source video</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={srcPath}
                onChange={(e) => {
                  setSrcPath(e.target.value)
                  setSrcStatus({ kind: 'idle' })
                }}
                placeholder="Click Browse to pick a video file"
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
              <Button
                variant="outline"
                size="sm"
                className="border-zinc-700 text-zinc-300 flex-shrink-0"
                onClick={pickFile}
                disabled={submitting}
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Browse
              </Button>
            </div>
            {filenameBase && (
              <p className="text-[10px] text-zinc-500 mt-1 truncate">Selected: {filenameBase}</p>
            )}
          </div>

          {/* Trim UI for too-long sources */}
          {isTrimming && trimSrcUrl && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 space-y-3">
              <div className="flex items-center gap-2 text-xs text-zinc-300">
                <Scissors className="h-3.5 w-3.5 text-blue-400" />
                <span className="font-semibold">Trim window</span>
                <span className="text-zinc-500">·</span>
                <span className="text-zinc-400 tabular-nums">
                  {formatSeconds(trimStart)} – {formatSeconds(trimEnd)} of {formatSeconds(srcDuration)}
                </span>
              </div>

              {/* Video preview — falls back to a static panel when the
                  source codec isn't decodable by Chromium's <video> tag
                  (e.g. HEVC .mov, MKV, ProRes). Trimming still works because
                  the saved take is re-encoded via ffmpeg on confirm. */}
              {previewFailed ? (
                <div className="relative bg-zinc-900 rounded-lg border border-zinc-800 px-3 py-6 text-center">
                  <p className="text-xs text-zinc-300">Live preview unavailable for this codec.</p>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Trimming still works — the selected {baseDuration.toFixed(2)}s window will be re-encoded on confirm.
                  </p>
                </div>
              ) : (
                <div className="relative bg-black rounded-lg overflow-hidden">
                  <video
                    ref={videoRef}
                    key={trimSrcUrl}
                    src={trimSrcUrl}
                    autoPlay
                    muted
                    playsInline
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={() => {
                      const v = videoRef.current
                      if (v) {
                        v.currentTime = trimStart
                        void v.play().catch(() => {})
                      }
                    }}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onError={() => setPreviewFailed(true)}
                    className="w-full max-h-[40vh] object-contain bg-black"
                  />
                  <button
                    onClick={togglePlay}
                    className="absolute bottom-2 right-2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                </div>
              )}

              {/* Trim track: full source duration. Red line = trim start
                  (draggable). Blue line = trim end (red + baseDuration,
                  follows). White line = current playback position, animated
                  during loop playback so the user can see where they are
                  inside the trim window. */}
              <div>
                <div
                  ref={trackRef}
                  className="relative h-12 rounded bg-zinc-800 select-none touch-none"
                >
                  {/* Highlighted trim window */}
                  <div
                    className="absolute top-0 bottom-0 bg-blue-500/20 pointer-events-none"
                    style={{
                      left: `${(trimStart / srcDuration) * 100}%`,
                      width: `${(baseDuration / srcDuration) * 100}%`,
                    }}
                  />
                  {/* White playhead — current playback position */}
                  <div
                    className="absolute top-0 bottom-0 w-px bg-white/90 pointer-events-none shadow-[0_0_4px_rgba(255,255,255,0.6)]"
                    style={{ left: `${playheadPct * 100}%` }}
                  />
                  {/* Blue end line */}
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-blue-400 pointer-events-none"
                    style={{ left: `calc(${(trimEnd / srcDuration) * 100}% - 1px)` }}
                  />
                  {/* Red start handle — wider invisible hit area for grabbing */}
                  <div
                    onPointerDown={handleRedPointerDown}
                    onPointerMove={handleRedPointerMove}
                    onPointerUp={handleRedPointerUp}
                    onPointerCancel={handleRedPointerUp}
                    className="absolute top-0 bottom-0 cursor-ew-resize"
                    style={{
                      left: `calc(${(trimStart / srcDuration) * 100}% - 6px)`,
                      width: '12px',
                    }}
                    title="Drag to choose where the trim window starts"
                  >
                    <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-red-500" />
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-zinc-500 mt-2 tabular-nums">
                  <span>0s</span>
                  <span className="text-blue-300 font-semibold">
                    keep {baseDuration.toFixed(2)}s starting at {trimStart.toFixed(2)}s
                  </span>
                  <span>{srcDuration.toFixed(2)}s</span>
                </div>
              </div>
              <p className="text-[10px] text-zinc-500">
                Drag the red line to choose the trim start; the blue line marks the end. The white line shows the current playback position as the video loops. The trimmed segment is re-encoded on confirm.
              </p>
            </div>
          )}

          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1 block">
              Label <span className="text-red-400 normal-case">(required)</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Best, Backup, Cooler grade — shown on the timeline clip"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              The label appears on the clip block in the timeline so you can tell variants apart at a glance.
            </p>
          </div>

          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1 block">Prompt <span className="text-zinc-600 normal-case">(optional)</span></label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="The prompt used to generate this take"
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1 block">Platform <span className="text-zinc-600 normal-case">(optional)</span></label>
            <input
              type="text"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              placeholder="e.g. higgsfield, ltx, runway"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300 break-words">{error}</p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-700 text-zinc-300"
              onClick={close}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-blue-500 text-blue-300 disabled:opacity-40"
              onClick={handleConfirm}
              disabled={submitDisabled}
              title={!label.trim() ? 'Label is required' : srcStatus.kind === 'too-short' ? 'Source is shorter than required' : undefined}
            >
              {submitting
                ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : isTrimming
                  ? <Scissors className="h-3.5 w-3.5 mr-1.5" />
                  : <Plus className="h-3.5 w-3.5 mr-1.5" />}
              {isTrimming ? 'Trim and add' : 'Add take'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
