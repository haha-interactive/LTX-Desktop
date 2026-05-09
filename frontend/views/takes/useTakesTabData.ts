import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Asset, AssetTake, Project } from '../../types/project-model'
import { logger } from '../../lib/logger'
import { useProjects } from '../../contexts/ProjectContext'

export interface TakeFolderListEntry {
  name: string
  path: string
  takeCount: number
  baseDuration: number | null
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

function projectAssetsForFolder(project: Project | null, folderPath: string): Asset[] {
  if (!project) return []
  return project.assets.filter(asset => asset.sourceFolder === folderPath)
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
        setFolders(result.folders)
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingList(false)
    }
  }, [projectId])

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
  const syncRefreshedFolderToProject = useCallback((refreshed: TakeFolderResultLike) => {
    const matching = projectAssetsForFolder(activeProject, refreshed.sourceFolder)
    for (const asset of matching) {
      const idx = asset.activeTakeIndex !== undefined
        ? Math.min(Math.max(0, asset.activeTakeIndex), refreshed.takes.length - 1)
        : refreshed.activeTakeIndex
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

  const applyRefreshed = useCallback((refreshed: TakeFolderResultLike) => {
    setFolderDetail(refreshed)
    syncRefreshedFolderToProject(refreshed)
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
    })
    return { ok: true }
  }, [applyRefreshed, projectId, selectedFolderPath])

  const linkedAssetsForSelectedFolder = useMemo<Asset[]>(() => (
    selectedFolderPath ? projectAssetsForFolder(activeProject, selectedFolderPath) : []
  ), [activeProject, selectedFolderPath])

  // Log errors for visibility.
  useEffect(() => { if (listError) logger.warn(`Takes-tab list error: ${listError}`) }, [listError])
  useEffect(() => { if (detailError) logger.warn(`Takes-tab detail error: ${detailError}`) }, [detailError])

  return {
    folders,
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
