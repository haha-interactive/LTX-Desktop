import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Asset, AssetTake, Project } from '../../types/project-model'
import { logger } from '../../lib/logger'
import { useProjects } from '../../contexts/ProjectContext'

export type TakeFolderOrigin = 'project' | 'external'

export interface TakeFolderListEntry {
  name: string
  path: string
  takeCount: number
  baseDuration: number | null
  origin: TakeFolderOrigin
}

function basenameOf(folderPath: string): string {
  const parts = folderPath.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || folderPath
}

// Legacy assets imported before commit 1801204 don't carry `sourceFolder`.
// Recover it from the takes' filesystem paths when possible. We only treat an
// asset as a take-folder import when ALL takes share the same parent directory
// AND that directory isn't the project assets root (basename === projectId)
// or any other "project-*" pseudo-folder. Otherwise this catches retake-history
// assets whose takes live directly in the project root and tries to load them
// as take folders, spamming `Manifest not found` errors.
function deriveSourceFolderFromAsset(asset: Asset, projectId: string): string | null {
  if (!asset.takes || asset.takes.length === 0) return null
  const dirs: (string | null)[] = asset.takes
    .map(t => t.path)
    .filter((p): p is string => Boolean(p))
    .map(p => {
      const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
      return i > 0 ? p.slice(0, i) : null
    })
  if (dirs.length === 0 || dirs.some(d => d === null)) return null
  const first = dirs[0]!
  if (!dirs.every(d => d === first)) return null
  const basename = first.split(/[\\/]/).filter(Boolean).pop() || first
  if (basename === projectId) return null
  if (/^project-/i.test(basename)) return null
  return first
}

function effectiveSourceFolder(asset: Asset, projectId: string): string | null {
  return asset.sourceFolder ?? deriveSourceFolderFromAsset(asset, projectId)
}

export type TakeFolderResultLike = {
  sourceFolder: string
  displayName: string
  duration: number
  activeTakeIndex: number
  takes: AssetTake[]
}

interface UseTakesTabDataParams {
  projectId: string
}

function toTakeArray(takes: TakeFolderResultLike['takes']): AssetTake[] {
  // The IPC response shape already matches AssetTake (with optional fields).
  return takes.map(t => ({ ...t }))
}

function projectAssetsForFolder(project: Project | null, folderPath: string, projectId: string): Asset[] {
  if (!project) return []
  return project.assets.filter(asset => effectiveSourceFolder(asset, projectId) === folderPath)
}

function makeAssetId(): string {
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export interface InspectedTakeEntry {
  file: string
  label?: string
  fileExists: boolean
  duration: number | null
  durationMismatch: boolean
}

export interface TakeFolderInspectionResult {
  folderPath: string
  displayName: string
  baseDuration: number | null
  takes: InspectedTakeEntry[]
  issues: {
    missingFiles: string[]
    missingLabels: string[]
    durationMismatches: Array<{ file: string; duration: number }>
  }
}

export function useTakesTabData({ projectId }: UseTakesTabDataParams) {
  const { activeProject, updateAsset, setProject } = useProjects()
  const [importInspections, setImportInspections] = useState<TakeFolderInspectionResult[] | null>(null)

  const [folders, setFolders] = useState<TakeFolderListEntry[]>([])
  const [loadingList, setLoadingList] = useState<boolean>(false)
  const [listError, setListError] = useState<string | null>(null)

  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null)
  const [folderDetail, setFolderDetail] = useState<TakeFolderResultLike | null>(null)
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const refreshList = useCallback(async () => {
    const api = window.electronAPI
    if (!api) return
    setLoadingList(true)
    setListError(null)
    try {
      const result = await api.listProjectTakesFolders({ projectId })
      if (!result.success) {
        setListError(result.error)
        setFolders([])
      } else {
        setFolders(result.folders.map(f => ({ ...f, origin: 'project' as const })))
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingList(false)
    }
  }, [projectId])

  // The takes-tab list mirrors the project's assets: a folder shows up here
  // iff it's linked to at least one project asset that has takes. This keeps
  // the takes tab in sync with the Video Editor / Storyboard — deleting an
  // asset in either view drops the folder from this list, while leaving the
  // disk files untouched. Orphan folders on disk can be re-imported via the
  // Import button.
  const combinedFolders = useMemo<TakeFolderListEntry[]>(() => {
    if (!activeProject) return []
    const linkedFolderPaths = new Set<string>()
    for (const asset of activeProject.assets) {
      if (!asset.takes || asset.takes.length === 0) continue
      const folder = effectiveSourceFolder(asset, projectId)
      if (folder) linkedFolderPaths.add(folder)
    }
    const result: TakeFolderListEntry[] = []
    const seen = new Set<string>()
    // Disk-side folders that have a linked asset — keep richer disk metadata.
    for (const f of folders) {
      if (!linkedFolderPaths.has(f.path)) continue
      result.push(f)
      seen.add(f.path)
    }
    // External (out-of-takes-dir) assets — by definition linked.
    for (const asset of activeProject.assets) {
      if (!asset.takes || asset.takes.length === 0) continue
      const folder = effectiveSourceFolder(asset, projectId)
      if (!folder || seen.has(folder)) continue
      seen.add(folder)
      result.push({
        name: basenameOf(folder),
        path: folder,
        takeCount: asset.takes.length,
        baseDuration: asset.duration ?? null,
        origin: 'external',
      })
    }
    result.sort((a, b) => a.name.localeCompare(b.name))
    return result
  }, [folders, activeProject, projectId])

  // Load folder list whenever project changes.
  useEffect(() => {
    void refreshList()
  }, [refreshList])

  const loadFolderDetail = useCallback(async (folderPath: string) => {
    const api = window.electronAPI
    if (!api) return
    setLoadingDetail(true)
    setDetailError(null)
    try {
      const result = await api.loadTakeFolder({ folderPath, projectId })
      if (!result.success) {
        setDetailError(result.error)
        setFolderDetail(null)
        return
      }
      setFolderDetail({
        sourceFolder: result.sourceFolder,
        displayName: result.displayName,
        duration: result.duration,
        activeTakeIndex: result.activeTakeIndex,
        takes: toTakeArray(result.takes),
      })
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : String(err))
      setFolderDetail(null)
    } finally {
      setLoadingDetail(false)
    }
  }, [projectId])

  // Load detail when selection changes.
  useEffect(() => {
    if (selectedFolderPath) {
      void loadFolderDetail(selectedFolderPath)
    } else {
      setFolderDetail(null)
    }
  }, [selectedFolderPath, loadFolderDetail])

  // Propagate a refreshed folder result into ProjectContext: every Asset whose
  // sourceFolder matches gets its takes/active-take fields updated in place.
  // When `promoteActiveTake` is true (Set-as-default flow), the linked assets'
  // activeTakeIndex is overwritten with the manifest's new selected index — this
  // mirrors the editor's asset-take-cycle UX so the timeline picks up the new
  // primary take immediately. Otherwise (replace-video / metadata edits), the
  // asset's existing per-asset selection is preserved.
  const syncRefreshedFolderToProject = useCallback((
    refreshed: TakeFolderResultLike,
    opts: { promoteActiveTake?: boolean } = {},
  ) => {
    const matching = projectAssetsForFolder(activeProject, refreshed.sourceFolder, projectId)
    for (const asset of matching) {
      const idx = opts.promoteActiveTake
        ? refreshed.activeTakeIndex
        : (asset.activeTakeIndex !== undefined
            ? Math.min(Math.max(0, asset.activeTakeIndex), refreshed.takes.length - 1)
            : refreshed.activeTakeIndex)
      const active = refreshed.takes[idx]
      if (!active) continue
      updateAsset(projectId, asset.id, {
        takes: refreshed.takes,
        activeTakeIndex: idx,
        duration: refreshed.duration,
        path: active.path,
        bigThumbnailPath: active.bigThumbnailPath,
        smallThumbnailPath: active.smallThumbnailPath,
        width: active.width,
        height: active.height,
      })
    }
  }, [activeProject, projectId, updateAsset])

  const applyRefreshed = useCallback((
    refreshed: TakeFolderResultLike,
    opts: { promoteActiveTake?: boolean } = {},
  ) => {
    setFolderDetail(refreshed)
    syncRefreshedFolderToProject(refreshed, opts)
    // Also update the list entry's metadata (take count / base duration may have shifted).
    void refreshList()
  }, [refreshList, syncRefreshedFolderToProject])

  const replaceTakeVideo = useCallback(async (takeIndex: number, srcVideoPath: string, mode: 'overwrite' | 'new-file'): Promise<{ ok: true } | { ok: false; error: string }> => {
    const api = window.electronAPI
    if (!api || !selectedFolderPath) return { ok: false, error: 'No folder selected' }
    const result = await api.replaceTakeVideo({
      folderPath: selectedFolderPath,
      takeIndex,
      srcVideoPath,
      mode,
      projectId,
    })
    if (!result.success) return { ok: false, error: result.error }
    applyRefreshed({
      sourceFolder: result.sourceFolder,
      displayName: result.displayName,
      duration: result.duration,
      activeTakeIndex: result.activeTakeIndex,
      takes: toTakeArray(result.takes),
    })
    return { ok: true }
  }, [applyRefreshed, projectId, selectedFolderPath])

  const updateTakeMetadata = useCallback(async (takeIndex: number, patch: { label?: string; prompt?: string; platform?: string }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const api = window.electronAPI
    if (!api || !selectedFolderPath) return { ok: false, error: 'No folder selected' }
    const result = await api.updateTakeMetadata({
      folderPath: selectedFolderPath,
      takeIndex,
      patch,
      projectId,
    })
    if (!result.success) return { ok: false, error: result.error }
    applyRefreshed({
      sourceFolder: result.sourceFolder,
      displayName: result.displayName,
      duration: result.duration,
      activeTakeIndex: result.activeTakeIndex,
      takes: toTakeArray(result.takes),
    })
    return { ok: true }
  }, [applyRefreshed, projectId, selectedFolderPath])

  const setDefaultTake = useCallback(async (takeFilename: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    const api = window.electronAPI
    if (!api || !selectedFolderPath) return { ok: false, error: 'No folder selected' }
    const result = await api.setTakeFolderSelected({
      folderPath: selectedFolderPath,
      takeFilename,
      projectId,
    })
    if (!result.success) return { ok: false, error: result.error }
    applyRefreshed({
      sourceFolder: result.sourceFolder,
      displayName: result.displayName,
      duration: result.duration,
      activeTakeIndex: result.activeTakeIndex,
      takes: toTakeArray(result.takes),
    }, { promoteActiveTake: true })
    return { ok: true }
  }, [applyRefreshed, projectId, selectedFolderPath])

  // Renames are display-name only (manifest.name). The folder on disk and
  // every linked asset's sourceFolder/paths are unchanged, so we just refresh
  // the detail view + folder list to pick up the new displayName.
  const renameFolder = useCallback(async (newName: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    const api = window.electronAPI
    if (!api || !selectedFolderPath) return { ok: false, error: 'No folder selected' }
    const result = await api.renameTakeFolder({
      folderPath: selectedFolderPath,
      newName,
      projectId,
    })
    if (!result.success) return { ok: false, error: result.error }
    setFolderDetail({
      sourceFolder: result.sourceFolder,
      displayName: result.displayName,
      duration: result.duration,
      activeTakeIndex: result.activeTakeIndex,
      takes: toTakeArray(result.takes),
    })
    void refreshList()
    return { ok: true }
  }, [projectId, refreshList, selectedFolderPath])

  const addTake = useCallback(async (
    srcVideoPath: string,
    metadata?: { label?: string; prompt?: string; platform?: string },
    trim?: { startSeconds: number; durationSeconds: number },
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    const api = window.electronAPI
    if (!api || !selectedFolderPath) return { ok: false, error: 'No folder selected' }
    const result = await api.addTakeToFolder({
      folderPath: selectedFolderPath,
      srcVideoPath,
      metadata,
      trim,
      projectId,
    })
    if (!result.success) return { ok: false, error: result.error }
    applyRefreshed({
      sourceFolder: result.sourceFolder,
      displayName: result.displayName,
      duration: result.duration,
      activeTakeIndex: result.activeTakeIndex,
      takes: toTakeArray(result.takes),
    })
    return { ok: true }
  }, [applyRefreshed, projectId, selectedFolderPath])

  const linkedAssetsForSelectedFolder = useMemo<Asset[]>(() => (
    selectedFolderPath ? projectAssetsForFolder(activeProject, selectedFolderPath, projectId) : []
  ), [activeProject, selectedFolderPath])

  // Log errors for visibility.
  useEffect(() => { if (listError) logger.warn(`Takes-tab list error: ${listError}`) }, [listError])
  useEffect(() => { if (detailError) logger.warn(`Takes-tab detail error: ${detailError}`) }, [detailError])

  // ─── Multi-folder import flow ────────────────────────────────────────────────

  const startImport = useCallback(async () => {
    const api = window.electronAPI
    if (!api) return
    const folders = await api.showOpenDirectoryDialog({ title: 'Select take folder(s) to import' })
    // Note: showOpenDirectoryDialog returns a single string; for multi-select we'd need
    // showOpenFileDialog with openDirectory+multiSelections. Current IPC only picks one.
    // Multi-select can be added later; for now pick one folder at a time.
    if (!folders) return
    const folderPath = folders  // string
    const result = await api.inspectTakeFolder({ folderPath })
    if (!result.success) {
      logger.warn(`Inspect failed for ${folderPath}: ${result.error}`)
      return
    }
    const inspection: TakeFolderInspectionResult = {
      folderPath: result.folderPath,
      displayName: result.displayName,
      baseDuration: result.baseDuration,
      takes: result.takes,
      issues: result.issues,
    }
    const hasAnyIssue = result.issues.missingFiles.length > 0
      || result.issues.missingLabels.length > 0
      || result.issues.durationMismatches.length > 0
    if (!hasAnyIssue) {
      // No issues — import directly.
      void finishImport([{ inspection, labelPatches: [] }])
    } else {
      setImportInspections([inspection])
    }
  }, [])  // finishImport added below via ref pattern

  const finishImport = useCallback(async (
    items: Array<{ inspection: TakeFolderInspectionResult; labelPatches: { file: string; label: string }[] }>,
  ) => {
    const api = window.electronAPI
    if (!api || !activeProject) return
    const toasts: string[] = []
    for (const { inspection, labelPatches } of items) {
      const { folderPath, displayName } = inspection
      try {
        // 1. Patch labels in one manifest write (no thumbnail regen).
        if (labelPatches.length > 0) {
          const patchResult = await api.patchTakeManifestLabels({ folderPath, patches: labelPatches })
          if (!patchResult.success) throw new Error(patchResult.error)
        }
        // 2. Full import — probes durations, generates thumbnails, approves path.
        const result = await api.loadTakeFolder({ folderPath, projectId })
        if (!result.success) throw new Error(result.error)
        const refreshed: TakeFolderResultLike = {
          sourceFolder: result.sourceFolder,
          displayName: result.displayName,
          duration: result.duration,
          activeTakeIndex: result.activeTakeIndex,
          takes: toTakeArray(result.takes),
        }
        applyRefreshed(refreshed)
        // 3. Add as a project Asset if not already linked.
        const already = activeProject.assets.some(
          a => effectiveSourceFolder(a, projectId) === result.sourceFolder,
        )
        if (!already && activeProject) {
          const active = result.takes[result.activeTakeIndex]
          if (active) {
            const newAsset: Asset = {
              id: makeAssetId(),
              type: 'video',
              path: active.path,
              bigThumbnailPath: active.bigThumbnailPath,
              smallThumbnailPath: active.smallThumbnailPath,
              width: active.width,
              height: active.height,
              prompt: `Imported takes: ${result.displayName}`,
              resolution: 'imported',
              duration: result.duration,
              takes: result.takes,
              activeTakeIndex: result.activeTakeIndex,
              sourceFolder: result.sourceFolder,
              createdAt: Date.now(),
            }
            setProject(projectId, {
              ...activeProject,
              assets: [newAsset, ...activeProject.assets],
              updatedAt: Date.now(),
            })
          }
        }
        toasts.push(`"${displayName}" imported`)
      } catch (err) {
        logger.error(`Import failed for ${displayName}: ${err}`)
        toasts.push(`"${displayName}" failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    setImportInspections(null)
    void refreshList()
    return toasts
  }, [activeProject, applyRefreshed, projectId, refreshList, setProject])

  const cancelImport = useCallback(() => setImportInspections(null), [])

  return {
    folders: combinedFolders,
    loadingList,
    listError,

    selectedFolderPath,
    setSelectedFolderPath,

    folderDetail,
    loadingDetail,
    detailError,

    linkedAssetsForSelectedFolder,

    refreshList,
    replaceTakeVideo,
    updateTakeMetadata,
    setDefaultTake,
    addTake,
    renameFolder,

    importInspections,
    startImport,
    finishImport,
    cancelImport,
  }
}
