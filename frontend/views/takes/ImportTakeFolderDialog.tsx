import { useCallback, useMemo, useState } from 'react'
import { X, CheckCircle, AlertCircle, XCircle, Loader2, FolderInput } from 'lucide-react'
import { Button } from '../../components/ui/button'
import type { TakeFolderInspectionResult } from './useTakesTabData'

interface ImportTakeFolderDialogProps {
  inspections: TakeFolderInspectionResult[]
  onConfirm: (
    items: Array<{
      inspection: TakeFolderInspectionResult
      labelPatches: { file: string; label: string }[]
    }>,
  ) => Promise<string[] | undefined>
  onCancel: () => void
}

type FolderStatus = 'clean' | 'fixable' | 'blocked'

function folderStatus(inspection: TakeFolderInspectionResult): FolderStatus {
  const { missingFiles, durationMismatches } = inspection.issues
  if (missingFiles.length > 0 || durationMismatches.length > 0) return 'blocked'
  if (inspection.issues.missingLabels.length > 0) return 'fixable'
  return 'clean'
}

export function ImportTakeFolderDialog({
  inspections,
  onConfirm,
  onCancel,
}: ImportTakeFolderDialogProps) {
  // labelInputs[folderPath][file] = label
  const [labelInputs, setLabelInputs] = useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {}
    for (const insp of inspections) {
      init[insp.folderPath] = {}
      for (const file of insp.issues.missingLabels) {
        init[insp.folderPath][file] = ''
      }
    }
    return init
  })
  const [submitting, setSubmitting] = useState(false)
  const [toasts, setToasts] = useState<string[] | null>(null)

  const setLabel = useCallback((folderPath: string, file: string, value: string) => {
    setLabelInputs(prev => ({
      ...prev,
      [folderPath]: { ...(prev[folderPath] ?? {}), [file]: value },
    }))
  }, [])

  const summaries = useMemo(() => inspections.map(i => ({
    inspection: i,
    status: folderStatus(i),
  })), [inspections])

  const importableCount = summaries.filter(s => s.status !== 'blocked').length
  const blockedCount = summaries.filter(s => s.status === 'blocked').length

  const allLabelsFilledForFixable = useMemo(() => {
    for (const { inspection, status } of summaries) {
      if (status !== 'fixable') continue
      const inputs = labelInputs[inspection.folderPath] ?? {}
      for (const file of inspection.issues.missingLabels) {
        if (!inputs[file]?.trim()) return false
      }
    }
    return true
  }, [summaries, labelInputs])

  const canImport = importableCount > 0 && allLabelsFilledForFixable && !submitting

  const handleImport = useCallback(async () => {
    setSubmitting(true)
    const items = summaries
      .filter(s => s.status !== 'blocked')
      .map(({ inspection }) => {
        const inputs = labelInputs[inspection.folderPath] ?? {}
        const labelPatches = inspection.issues.missingLabels
          .map(file => ({ file, label: inputs[file]?.trim() ?? '' }))
          .filter(p => p.label)
        return { inspection, labelPatches }
      })
    const results = await onConfirm(items)
    setSubmitting(false)
    if (results) setToasts(results)
  }, [labelInputs, onConfirm, summaries])

  if (toasts) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onCancel}
      >
        <div
          className="bg-zinc-900 rounded-2xl border border-zinc-700/50 shadow-2xl w-full max-w-md flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Import complete</h2>
            <button onClick={onCancel} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="p-6 space-y-2">
            {toasts.map((msg, i) => (
              <p key={i} className={`text-sm ${msg.includes('failed') ? 'text-red-300' : 'text-zinc-200'}`}>{msg}</p>
            ))}
            <p className="text-xs text-zinc-500 mt-3">
              Imported folders appear in the Video Editor's asset panel after switching tabs.
            </p>
          </div>
          <div className="px-6 pb-5 flex justify-end">
            <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300" onClick={onCancel}>
              Done
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="bg-zinc-900 rounded-2xl border border-zinc-700/50 shadow-2xl w-full max-w-xl flex flex-col max-h-[calc(100vh-2rem)]"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <FolderInput className="h-4 w-4 text-blue-400" />
            <h2 className="text-base font-semibold text-white">Import take folders</h2>
          </div>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 disabled:opacity-30"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-zinc-800">
          {summaries.map(({ inspection, status }) => (
            <div key={inspection.folderPath} className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                {status === 'clean' && <CheckCircle className="h-4 w-4 text-green-400 flex-shrink-0" />}
                {status === 'fixable' && <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0" />}
                {status === 'blocked' && <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white truncate">{inspection.displayName}</p>
                  <p className="text-[11px] text-zinc-500">
                    {inspection.takes.length} take{inspection.takes.length === 1 ? '' : 's'}
                    {inspection.baseDuration !== null ? ` · ${inspection.baseDuration.toFixed(2)}s base duration` : ''}
                  </p>
                </div>
                {status === 'blocked' && (
                  <span className="ml-auto text-[10px] text-red-400 font-semibold uppercase tracking-wider flex-shrink-0">
                    Blocked — will be skipped
                  </span>
                )}
                {status === 'clean' && (
                  <span className="ml-auto text-[10px] text-green-400 font-semibold uppercase tracking-wider flex-shrink-0">
                    Ready
                  </span>
                )}
                {status === 'fixable' && (
                  <span className="ml-auto text-[10px] text-amber-400 font-semibold uppercase tracking-wider flex-shrink-0">
                    Labels required
                  </span>
                )}
              </div>

              {inspection.issues.missingFiles.length > 0 && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs">
                  <p className="text-red-300 font-medium mb-1">Missing files (folder can't be imported):</p>
                  {inspection.issues.missingFiles.map(f => (
                    <p key={f} className="text-red-300/70 font-mono">{f}</p>
                  ))}
                </div>
              )}

              {inspection.issues.durationMismatches.length > 0 && (
                <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs">
                  <p className="text-red-300 font-medium mb-1">Duration mismatches (folder can't be imported):</p>
                  {inspection.issues.durationMismatches.map(d => (
                    <p key={d.file} className="text-red-300/70 font-mono">
                      {d.file} — {d.duration.toFixed(3)}s (base: {inspection.baseDuration?.toFixed(3) ?? '?'}s)
                    </p>
                  ))}
                </div>
              )}

              {status === 'fixable' && inspection.issues.missingLabels.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] text-amber-300 font-semibold uppercase tracking-wider">
                    Enter a label for each take (required)
                  </p>
                  {inspection.issues.missingLabels.map(file => (
                    <div key={file} className="flex items-center gap-2">
                      <span className="text-[11px] text-zinc-500 font-mono w-32 flex-shrink-0 truncate">{file}</span>
                      <input
                        type="text"
                        value={labelInputs[inspection.folderPath]?.[file] ?? ''}
                        onChange={e => setLabel(inspection.folderPath, file, e.target.value)}
                        placeholder="e.g. Best, Backup, Alt colour"
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between flex-shrink-0">
          <p className="text-[11px] text-zinc-500">
            {importableCount} importable{blockedCount > 0 ? ` · ${blockedCount} skipped` : ''}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-300" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-blue-500 text-blue-300 disabled:opacity-40"
              onClick={handleImport}
              disabled={!canImport}
            >
              {submitting
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Importing...</>
                : blockedCount > 0
                  ? `Import ${importableCount} · skip ${blockedCount}`
                  : `Import ${importableCount} folder${importableCount === 1 ? '' : 's'}`}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
