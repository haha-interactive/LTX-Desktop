import { useCallback, useState } from 'react'
import type { Asset } from '../../types/project-model'
import { logger } from '../../lib/logger'
import {
  selectSelectionExportPayload,
  type SelectionExportPayload,
} from './editor-selectors'
import { useEditorActions, useEditorStore } from './editor-store'

export type TakeFolderTargetMode = 'create' | 'append'

export interface TakeFolderExportRequest {
  mode: TakeFolderTargetMode
  folderName: string
  label?: string
  codec: 'h264'
  fps: number
  quality: number
  width: number
  height: number
}

export interface TakeFolderListEntry {
  name: string
  path: string
  takeCount: number
  baseDuration: number | null
}

export type TakeFolderExportStatus = 'idle' | 'preparing' | 'rendering' | 'finalizing' | 'done' | 'error'

interface UseTakeFolderExportParams {
  projectId: string
}

function makeAssetId(): string {
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export function useTakeFolderExport({ projectId }: UseTakeFolderExportParams) {
  const { replaceSelectionWithTake, closeSaveSelectionAsTakeModal } = useEditorActions()
  const payload = useEditorStore(selectSelectionExportPayload)

  const [status, setStatus] = useState<TakeFolderExportStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [resultFolderPath, setResultFolderPath] = useState<string | null>(null)

  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
    setResultFolderPath(null)
  }, [])

  const listFolders = useCallback(async (): Promise<TakeFolderListEntry[]> => {
    const api = window.electronAPI
    if (!api) return []
    const result = await api.listProjectTakesFolders({ projectId })
    if (!result.success) {
      logger.warn(`Failed to list takes folders: ${result.error}`)
      return []
    }
    return result.folders
  }, [projectId])

  const runExport = useCallback(async (req: TakeFolderExportRequest, currentPayload: SelectionExportPayload): Promise<boolean> => {
    const api = window.electronAPI
    if (!api) {
      setError('Electron bridge not available')
      setStatus('error')
      return false
    }

    setStatus('preparing')
    setError(null)
    setResultFolderPath(null)

    const prepareResult = await api.prepareTakesFolderTarget({
      projectId,
      mode: req.mode,
      folderName: req.folderName,
      expectedDuration: currentPayload.selectionDuration,
    })
    if (!prepareResult.success) {
      setError(prepareResult.error)
      setStatus('error')
      return false
    }

    const outputPath = `${prepareResult.folderPath}/${prepareResult.takeFilename}`

    setStatus('rendering')
    const exportResult = await api.exportNative({
      clips: currentPayload.exportClips,
      outputPath,
      codec: req.codec,
      width: req.width,
      height: req.height,
      fps: req.fps,
      quality: req.quality,
    })
    if (exportResult && !exportResult.success) {
      setError(exportResult.error)
      setStatus('error')
      return false
    }

    setStatus('finalizing')
    const commitResult = await api.commitTakeManifest({
      folderPath: prepareResult.folderPath,
      takeFilename: prepareResult.takeFilename,
      label: req.label,
      projectId,
    })
    if (!commitResult.success) {
      setError(commitResult.error)
      setStatus('error')
      return false
    }

    const active = commitResult.takes[commitResult.activeTakeIndex]
    if (!active) {
      setError('Take folder loaded but contained no active take')
      setStatus('error')
      return false
    }

    const asset: Asset = {
      id: makeAssetId(),
      type: 'video',
      path: active.path,
      bigThumbnailPath: active.bigThumbnailPath,
      smallThumbnailPath: active.smallThumbnailPath,
      width: active.width,
      height: active.height,
      prompt: `Take: ${commitResult.displayName}`,
      resolution: 'imported',
      duration: commitResult.duration,
      takes: commitResult.takes,
      activeTakeIndex: commitResult.activeTakeIndex,
      createdAt: Date.now(),
    }

    replaceSelectionWithTake({
      expandedClipIds: currentPayload.expandedClipIds,
      asset,
      insertTrackIndex: currentPayload.insertTrackIndex,
      audioInsertTrackIndex: currentPayload.audioInsertTrackIndex,
      insertStartTime: currentPayload.selectionStart,
      selectionDuration: currentPayload.selectionDuration,
    })

    setResultFolderPath(prepareResult.folderPath)
    setStatus('done')
    return true
  }, [projectId, replaceSelectionWithTake])

  const closeAfterDone = useCallback(() => {
    closeSaveSelectionAsTakeModal()
    reset()
  }, [closeSaveSelectionAsTakeModal, reset])

  return {
    payload,
    status,
    error,
    resultFolderPath,
    listFolders,
    runExport,
    reset,
    closeAfterDone,
  }
}
