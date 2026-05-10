import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, Save, Star, RefreshCw, Film, FolderOpen, Plus, Pencil, Check, X as XIcon } from 'lucide-react'
import type { Asset, AssetTake } from '../../types/project-model'
import { Button } from '../../components/ui/button'
import { Tooltip } from '../../components/ui/tooltip'
import { pathToFileUrl } from '../../lib/file-url'
import { ReplaceTakeVideoDialog } from './ReplaceTakeVideoDialog'
import { AddTakeDialog } from './AddTakeDialog'
import type { TakeFolderResultLike } from './useTakesTabData'

interface TakeFolderDetailPanelProps {
  folderDetail: TakeFolderResultLike | null
  loading: boolean
  error: string | null
  linkedAssets: Asset[]
  onUpdateMetadata: (takeIndex: number, patch: { label?: string; prompt?: string; platform?: string }) => Promise<{ ok: true } | { ok: false; error: string }>
  onSetDefaultTake: (takeFilename: string) => Promise<{ ok: true } | { ok: false; error: string }>
  onReplaceTakeVideo: (takeIndex: number, srcPath: string, mode: 'overwrite' | 'new-file') => Promise<{ ok: true } | { ok: false; error: string }>
  onAddTake: (srcPath: string, metadata: { label?: string; prompt?: string; platform?: string }, trim?: { startSeconds: number; durationSeconds: number }) => Promise<{ ok: true } | { ok: false; error: string }>
  onRenameFolder: (newName: string) => Promise<{ ok: true } | { ok: false; error: string }>
}

function takeVideoSrc(take: AssetTake): string {
  return `${pathToFileUrl(take.path)}?v=${take.createdAt}`
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  const total = Math.max(0, seconds)
  const mm = Math.floor(total / 60)
  const ss = total - mm * 60
  return `${mm}:${ss.toFixed(2).padStart(5, '0')}`
}

export function TakeFolderDetailPanel({
  folderDetail,
  loading,
  error,
  linkedAssets,
  onUpdateMetadata,
  onSetDefaultTake,
  onReplaceTakeVideo,
  onAddTake,
  onRenameFolder,
}: TakeFolderDetailPanelProps) {
  const [previewIdx, setPreviewIdx] = useState(0)
  const [labelInput, setLabelInput] = useState('')
  const [promptInput, setPromptInput] = useState('')
  const [platformInput, setPlatformInput] = useState('')
  const [savingMeta, setSavingMeta] = useState(false)
  const [savingDefault, setSavingDefault] = useState(false)
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [savingRename, setSavingRename] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)

  // Reset preview index and inputs when folder changes.
  const folderKey = folderDetail?.sourceFolder ?? null
  useEffect(() => {
    if (!folderDetail) return
    setPreviewIdx(folderDetail.activeTakeIndex)
    setActionError(null)
  }, [folderKey, folderDetail])

  // Sync inputs to the currently-previewed take.
  useEffect(() => {
    if (!folderDetail) return
    const t = folderDetail.takes[previewIdx]
    if (!t) return
    setLabelInput(t.label ?? '')
    setPromptInput(t.prompt ?? '')
    setPlatformInput(t.platform ?? '')
  }, [previewIdx, folderDetail])

  const currentTake = folderDetail?.takes[previewIdx] ?? null
  const totalTakes = folderDetail?.takes.length ?? 0
  const filename = currentTake ? currentTake.path.split(/[\\/]/).pop() ?? '' : ''

  const dirty = useMemo(() => {
    if (!currentTake) return false
    return (
      labelInput.trim() !== (currentTake.label ?? '')
      || promptInput.trim() !== (currentTake.prompt ?? '')
      || platformInput.trim() !== (currentTake.platform ?? '')
    )
  }, [currentTake, labelInput, promptInput, platformInput])

  const goPrev = useCallback(() => {
    if (totalTakes === 0) return
    setPreviewIdx(idx => (idx - 1 + totalTakes) % totalTakes)
  }, [totalTakes])

  const goNext = useCallback(() => {
    if (totalTakes === 0) return
    setPreviewIdx(idx => (idx + 1) % totalTakes)
  }, [totalTakes])

  const handleSaveMetadata = useCallback(async () => {
    if (!currentTake || !dirty) return
    setSavingMeta(true)
    setActionError(null)
    const result = await onUpdateMetadata(previewIdx, {
      label: labelInput.trim(),
      prompt: promptInput.trim(),
      platform: platformInput.trim(),
    })
    setSavingMeta(false)
    if (!result.ok) setActionError(result.error)
  }, [currentTake, dirty, labelInput, onUpdateMetadata, platformInput, previewIdx, promptInput])

  const startRename = useCallback(() => {
    if (!folderDetail) return
    setRenameValue(folderDetail.displayName)
    setRenaming(true)
    setActionError(null)
  }, [folderDetail])

  const cancelRename = useCallback(() => {
    setRenaming(false)
    setRenameValue('')
  }, [])

  const commitRename = useCallback(async () => {
    if (!folderDetail) return
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === folderDetail.displayName) {
      cancelRename()
      return
    }
    setSavingRename(true)
    setActionError(null)
    const result = await onRenameFolder(trimmed)
    setSavingRename(false)
    if (!result.ok) {
      setActionError(result.error)
      return
    }
    setRenaming(false)
    setRenameValue('')
  }, [cancelRename, folderDetail, onRenameFolder, renameValue])

  const handleSetDefault = useCallback(async () => {
    if (!currentTake) return
    setSavingDefault(true)
    setActionError(null)
    const result = await onSetDefaultTake(filename)
    setSavingDefault(false)
    if (!result.ok) setActionError(result.error)
  }, [currentTake, filename, onSetDefaultTake])

  if (!folderDetail) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-zinc-500">
        {loading ? (
          <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading take folder...</span>
        ) : error ? (
          <span className="flex items-center gap-2 text-red-400"><AlertCircle className="h-4 w-4" /> {error}</span>
        ) : (
          <span>Select a take folder from the list.</span>
        )}
      </div>
    )
  }

  const isDefaultTake = folderDetail.activeTakeIndex === previewIdx

  return (
    <>
      <div className="h-full flex flex-col">
        {/* Sticky top: header + video + toolbar + filmstrip. Doesn't scroll. */}
        <div className="flex-shrink-0 px-6 pt-6 pb-3 space-y-3">
          <header className="flex items-baseline justify-between flex-wrap gap-2">
            <div className="min-w-0">
              {renaming ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void commitRename()
                      else if (e.key === 'Escape') cancelRename()
                    }}
                    disabled={savingRename}
                    className="bg-zinc-900 border border-blue-500 rounded-lg px-2 py-1 text-lg font-semibold text-white focus:outline-none w-[20rem] max-w-full"
                  />
                  <button
                    onClick={() => void commitRename()}
                    disabled={savingRename}
                    title="Save (Enter)"
                    className="p-1 rounded hover:bg-zinc-800 text-green-400 disabled:opacity-40"
                  >
                    {savingRename ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={cancelRename}
                    disabled={savingRename}
                    title="Cancel (Esc)"
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400 disabled:opacity-40"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={startRename}
                  className="group flex items-center gap-1.5 max-w-full"
                  title="Rename folder"
                >
                  <h2 className="text-lg font-semibold text-white truncate">{folderDetail.displayName}</h2>
                  <Pencil className="h-3.5 w-3.5 text-zinc-600 group-hover:text-zinc-300 transition-colors flex-shrink-0" />
                </button>
              )}
              <p className="text-xs text-zinc-500">
                {totalTakes} take{totalTakes === 1 ? '' : 's'} · base duration {formatDuration(folderDetail.duration)}
                {linkedAssets.length > 0 && (
                  <> · linked to {linkedAssets.length} asset{linkedAssets.length === 1 ? '' : 's'} in this project</>
                )}
              </p>
            </div>
          </header>

          {/* Video preview — height capped so toolbar stays visible on shorter windows */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
            <div
              className="bg-black flex items-center justify-center relative"
              style={{ maxHeight: '38vh', minHeight: '160px' }}
            >
            {currentTake ? (
              <video
                ref={videoRef}
                key={currentTake.path}
                src={takeVideoSrc(currentTake)}
                controls
                className="max-h-[38vh] w-auto max-w-full object-contain"
                style={{ minHeight: '160px' }}
              />
            ) : (
              <span className="text-zinc-600 text-sm">No takes</span>
            )}

            {totalTakes > 1 && (
              <>
                <button
                  onClick={goPrev}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={goNext}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center transition-colors"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
          <div className="px-3 py-2 border-t border-zinc-800 flex items-center justify-between gap-2 text-xs flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-zinc-300 font-medium whitespace-nowrap">Take {previewIdx + 1} / {totalTakes}</span>
              {isDefaultTake && (
                <span className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold flex items-center gap-1 whitespace-nowrap">
                  <Star className="h-3 w-3 fill-current" />
                  Default
                </span>
              )}
              {currentTake && (
                <span className="text-zinc-500 font-mono truncate">{filename}</span>
              )}
              {currentTake && (
                <span className="text-zinc-500 whitespace-nowrap">{currentTake.width} × {currentTake.height}</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Tooltip content="Add another video as a new take to this folder">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 border-zinc-700 text-zinc-300 text-[11px] px-2.5"
                  onClick={() => setAddDialogOpen(true)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add take
                </Button>
              </Tooltip>
              <Tooltip content="Open the take folder in your system file manager">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 border-zinc-700 text-zinc-300 text-[11px] px-2.5 disabled:opacity-40"
                  onClick={() => {
                    if (!currentTake) return
                    window.electronAPI?.showItemInFolder({ filePath: currentTake.path })
                  }}
                  disabled={!currentTake}
                >
                  <FolderOpen className="h-3 w-3 mr-1" />
                  Show in folder
                </Button>
              </Tooltip>
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-blue-500/60 text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 text-[11px] px-2.5"
                onClick={() => setReplaceDialogOpen(true)}
                disabled={!currentTake}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Replace video
              </Button>
              <Tooltip content={isDefaultTake ? 'Already the default take' : 'Make this the default take when this folder is loaded'}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 border-zinc-700 text-zinc-300 text-[11px] px-2.5 disabled:opacity-40"
                  onClick={handleSetDefault}
                  disabled={!currentTake || isDefaultTake || savingDefault}
                >
                  {savingDefault ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Star className="h-3 w-3 mr-1" />}
                  {isDefaultTake ? 'Default' : 'Set default'}
                </Button>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Filmstrip — all takes at a glance */}
        {totalTakes > 1 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-2 flex items-center gap-2 overflow-x-auto">
            {folderDetail.takes.map((take, idx) => {
              const thumbSrc = take.smallThumbnailPath
                ? `${pathToFileUrl(take.smallThumbnailPath)}?v=${take.createdAt}`
                : null
              const isCurrent = idx === previewIdx
              const isDefault = idx === folderDetail.activeTakeIndex
              return (
                <button
                  key={take.path}
                  onClick={() => setPreviewIdx(idx)}
                  className={`relative flex-shrink-0 rounded-md overflow-hidden border transition-all ${
                    isCurrent
                      ? 'border-blue-500 ring-2 ring-blue-500/40'
                      : 'border-zinc-800 hover:border-zinc-600'
                  }`}
                  title={take.label ? `Take ${idx + 1} · ${take.label}` : `Take ${idx + 1}`}
                >
                  {thumbSrc ? (
                    <img
                      src={thumbSrc}
                      alt=""
                      className="h-14 aspect-video object-cover bg-black"
                    />
                  ) : (
                    <div className="h-14 aspect-video bg-zinc-900 flex items-center justify-center">
                      <Film className="h-4 w-4 text-zinc-600" />
                    </div>
                  )}
                  <div className="absolute top-0.5 left-0.5 text-[9px] font-bold bg-black/70 text-white rounded px-1">
                    {idx + 1}
                  </div>
                  {isDefault && (
                    <div className="absolute top-0.5 right-0.5 bg-amber-500/90 text-black rounded-sm p-0.5">
                      <Star className="h-2.5 w-2.5 fill-current" />
                    </div>
                  )}
                  {take.label && (
                    <div className="absolute bottom-0 left-0 right-0 text-[9px] text-white bg-black/70 px-1 truncate text-left">
                      {take.label}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
        </div>

        {/* Scrollable bottom: metadata form + warnings + errors */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3 min-h-0">

        {/* Metadata editor */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 space-y-3">
          <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Metadata</h3>

          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1 block">Label</label>
            <input
              type="text"
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              placeholder="e.g. Best, Backup, Cooler grade"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1 block">Prompt</label>
            <textarea
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="The prompt used to generate this take"
              rows={3}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1 block">Platform</label>
            <input
              type="text"
              value={platformInput}
              onChange={(e) => setPlatformInput(e.target.value)}
              placeholder="e.g. higgsfield, ltx, runway"
              className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="border-zinc-700 text-zinc-300 disabled:opacity-40"
              onClick={handleSaveMetadata}
              disabled={!dirty || savingMeta}
            >
              {savingMeta ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              Save metadata
            </Button>
          </div>
        </section>


        {actionError && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs text-red-300 break-words">{actionError}</p>
            </div>
          </div>
        )}
        </div>
      </div>

      {replaceDialogOpen && currentTake && (
        <ReplaceTakeVideoDialog
          takeFilename={filename}
          takeIndex={previewIdx}
          baseDuration={folderDetail.duration}
          onClose={() => setReplaceDialogOpen(false)}
          onConfirm={async (srcPath, mode) => {
            // Dialog owns its inline error UI — don't leak to the panel banner.
            const result = await onReplaceTakeVideo(previewIdx, srcPath, mode)
            return result.ok
          }}
        />
      )}

      {addDialogOpen && (
        <AddTakeDialog
          baseDuration={folderDetail.duration}
          onClose={() => setAddDialogOpen(false)}
          onConfirm={async (srcPath, metadata, trim) => {
            // Dialog owns its inline error UI — don't bubble to the panel-level
            // banner so closing the dialog doesn't leave a stale error stuck
            // at the bottom of the Takes tab.
            return onAddTake(srcPath, metadata, trim)
          }}
        />
      )}
    </>
  )
}
