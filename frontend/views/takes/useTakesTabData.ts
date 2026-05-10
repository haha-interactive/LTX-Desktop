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

export function useTakesTabData({ projectId }: UseTakesTabDataParams) {
  const { activeProject, updateAsset } = useProjects()

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

  // Combined list: disk-side (project takes/) + asset-derived (external by-reference imports).
  // Deduped by path; on collision the disk entry wins (origin='project').
  const combinedFolders = useMemo<TakeFolderListEntry[]>(() => {
    if (!activeProject) return folders
    const seen = new Set(folders.map(f => f.path))
    const fromAssets: TakeFolderListEntry[] = []
    const seenInAssets = new Set<string>()
    for (const asset of activeProject.assets) {
      if (!asset.takes || asset.takes.length === 0) continue
      const folder = effectiveSourceFolder(asset, projectId)
      if (!folder) continue
      if (seen.has(folder)) continue
      if (seenInAssets.has(folder)) continue
      seenInAssets.add(folder)
      fromAssets.push({
        name: basenameOf(folder),
        path: folder,
        takeCount: asset.takes.length,
        baseDuration: asset.duration ?? null,
        origin: 'external',
      })
    }
    const merged = [...folders, ...fromAssets]
    merged.sort((a, b) => a.name.localeCompare(b.name))
    return merged
  }, [folders, activeProject])

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

  const linkedAssetsForSelectedFolder = useMemo<Asset[]>(() => (
    selectedFolderPath ? projectAssetsForFolder(activeProject, selectedFolderPath, projectId) : []
  ), [activeProject, selectedFolderPath])

  // Log errors for visibility.
  useEffect(() => { if (listError) logger.warn(`Takes-tab list error: ${listError}`) }, [listError])
  useEffect(() => { if (detailError) logger.warn(`Takes-tab detail error: ${detailError}`) }, [detailError])

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
  }
}
