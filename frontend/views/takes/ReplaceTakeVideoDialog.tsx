import { useCallback, useState } from 'react'
import { X, FileVideo, Loader2, AlertCircle, Upload } from 'lucide-react'
import { Button } from '../../components/ui/button'

interface ReplaceTakeVideoDialogProps {
  takeFilename: string
  takeIndex: number
  baseDuration: number
  onClose: () => void
  onConfirm: (srcPath: string, mode: 'overwrite' | 'new-file') => Promise<boolean>
}

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi']

export function ReplaceTakeVideoDialog({
  takeFilename,
  takeIndex,
  baseDuration,
  onClose,
  onConfirm,
}: ReplaceTakeVideoDialogProps) {
  const [srcPath, setSrcPath] = useState<string>('')
  const [mode, setMode] = useState<'overwrite' | 'new-file'>('overwrite')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pickFile = useCallback(async () => {
    const api = window.electronAPI
    if (!api) return
    const paths = await api.showOpenFileDialog({
      title: 'Select replacement video',
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
    const ok = await onConfirm(srcPath, mode)
    setSubmitting(false)
    if (ok) onClose()
  }, [mode, onClose, onConfirm, srcPath])

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
            <FileVideo className="h-4 w-4 text-blue-400" />
            <h2 className="text-base font-semibold text-white">Replace take video</h2>
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
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-400 space-y-1">
            <div className="flex justify-between">
              <span>Replacing</span>
              <span className="text-zinc-200 font-mono text-[11px]">Take {takeIndex + 1} ({takeFilename})</span>
            </div>
            <div className="flex justify-between">
              <span>Required duration</span>
              <span className="text-zinc-200">~{baseDuration.toFixed(2)}s (within 1 frame)</span>
            </div>
          </div>

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
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2 block">Mode</label>
            <div className="space-y-2">
              <label className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                mode === 'overwrite'
                  ? 'border-blue-500 bg-blue-500/5'
                  : 'border-zinc-800 hover:border-zinc-700'
              }`}>
                <input
                  type="radio"
                  name="replace-mode"
                  checked={mode === 'overwrite'}
                  onChange={() => setMode('overwrite')}
                  className="mt-0.5 accent-blue-500"
                />
                <div>
                  <p className="text-sm font-medium text-white">Overwrite existing file</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    Replaces <code className="text-zinc-400">{takeFilename}</code> in place. Old footage is gone. Manifest unchanged.
                  </p>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                mode === 'new-file'
                  ? 'border-blue-500 bg-blue-500/5'
                  : 'border-zinc-800 hover:border-zinc-700'
              }`}>
                <input
                  type="radio"
                  name="replace-mode"
                  checked={mode === 'new-file'}
                  onChange={() => setMode('new-file')}
                  className="mt-0.5 accent-blue-500"
                />
                <div>
                  <p className="text-sm font-medium text-white">Add as new file</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    Writes a versioned filename and points the manifest entry at it. Old file remains on disk.
                  </p>
                </div>
              </label>
            </div>
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
              disabled={!srcPath || submitting}
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FileVideo className="h-3.5 w-3.5 mr-1.5" />}
              Replace
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
