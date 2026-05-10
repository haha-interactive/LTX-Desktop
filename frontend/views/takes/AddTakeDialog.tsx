import { useCallback, useState } from 'react'
import { X, Plus, Loader2, AlertCircle, Upload } from 'lucide-react'
import { Button } from '../../components/ui/button'

interface AddTakeDialogProps {
  baseDuration: number
  onClose: () => void
  onConfirm: (
    srcPath: string,
    metadata: { label?: string; prompt?: string; platform?: string },
  ) => Promise<{ ok: true } | { ok: false; error: string }>
}

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi']

export function AddTakeDialog({
  baseDuration,
  onClose,
  onConfirm,
}: AddTakeDialogProps) {
  const [srcPath, setSrcPath] = useState<string>('')
  const [label, setLabel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [platform, setPlatform] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      setError(null)
    }
  }, [])

  const handleConfirm = useCallback(async () => {
    if (!srcPath) return
    setSubmitting(true)
    setError(null)
    const result = await onConfirm(srcPath, {
      label: label.trim() || undefined,
      prompt: prompt.trim() || undefined,
      platform: platform.trim() || undefined,
    })
    setSubmitting(false)
    if (result.ok) {
      onClose()
    } else {
      setError(result.error)
    }
  }, [label, onClose, onConfirm, platform, prompt, srcPath])

  const close = useCallback(() => {
    if (submitting) return
    onClose()
  }, [onClose, submitting])

  const filenameBase = srcPath ? srcPath.split(/[\\/]/).pop() ?? '' : ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={close}
    >
      <div
        className="bg-zinc-900 rounded-2xl border border-zinc-700/50 shadow-2xl w-full max-w-md relative overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
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

        <div className="p-6 space-y-4">
          {(() => {
            const isDurationError = !!error && /duration/i.test(error)
            return (
              <div
                className={`rounded-lg border p-3 text-xs transition-colors ${
                  isDurationError
                    ? 'border-red-500/40 bg-red-500/10 text-red-200'
                    : 'border-zinc-800 bg-zinc-950/50 text-zinc-400'
                }`}
              >
                <div className="flex justify-between">
                  <span className={isDurationError ? 'text-red-300' : 'text-zinc-300'}>Required duration</span>
                  <span className="font-semibold">~{baseDuration.toFixed(2)}s (within 1 frame)</span>
                </div>
                <p className={`text-[10px] mt-1 ${isDurationError ? 'text-red-300/80' : 'text-zinc-500'}`}>
                  The new video must match the folder's base duration. Mismatches are rejected.
                </p>
              </div>
            )
          })()}

          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1 block">Source video</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={srcPath}
                onChange={(e) => setSrcPath(e.target.value)}
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
              disabled={!srcPath || !label.trim() || submitting}
              title={!label.trim() ? 'Label is required' : undefined}
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
              Add take
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
