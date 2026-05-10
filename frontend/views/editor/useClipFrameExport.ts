import { useCallback, useState } from 'react'
import type { TimelineClip, Asset } from '../../types/project-model'
import { logger } from '../../lib/logger'
import { getClipDisplayLabel } from './clip-display-name'
import {
  selectClipPath,
  selectLiveAssetForClip,
  selectSelectedClipForProperties,
} from './editor-selectors'
import { useEditorStore } from './editor-store'
import type { EditorState } from './editor-state'

export type FrameMode = 'start' | 'end' | 'both'
export type FrameKind = 'start' | 'end'
export type FrameCollisionMode = 'overwrite' | 'auto-suffix'

export interface ClipFrameExportTarget {
  clipId: string
  videoPath: string
  displayLabel: string
  startSeekTime: number
  endSeekTime: number
  isVideo: boolean
}

export interface FrameExportRequestEntry {
  kind: FrameKind
  filename: string
  seekTime: number
  collisionMode: FrameCollisionMode
}

export interface FrameExportResult {
  kind: FrameKind
  outputPath: string
}

export type FrameExportStatus = 'idle' | 'exporting' | 'done' | 'error'

// ffmpeg fails to produce an output frame when -ss lands at or past the
// stream's last frame (common when the clip occupies the full asset duration
// and rounding pushes the end seek a few ms past EOF). Back off by ~one frame
// at 30fps so the seek always falls inside a real frame.
const END_SEEK_EPSILON = 0.04

function clampSeek(seek: number, assetDuration: number | undefined | null): number {
  const safe = Math.max(0, seek)
  if (assetDuration === undefined || assetDuration === null) return safe
  const cap = Math.max(0, assetDuration - END_SEEK_EPSILON)
  return Math.min(safe, cap)
}

function computeSeekTimes(clip: TimelineClip, asset: Asset | null | undefined): { start: number; end: number } {
  const speed = clip.speed || 1
  const trimStart = clip.trimStart || 0
  const trimEnd = clip.trimEnd || 0
  const duration = clip.duration
  const assetDuration = asset?.duration
  if (clip.reversed) {
    const fallbackDuration = trimStart + duration * speed + trimEnd
    const effectiveDuration = assetDuration ?? fallbackDuration
    const first = clampSeek(effectiveDuration - trimEnd, effectiveDuration)
    const last = Math.max(0, first - duration * speed)
    return { start: first, end: last }
  }
  return {
    start: trimStart,
    end: clampSeek(trimStart + duration * speed, assetDuration),
  }
}

export function selectClipFrameExportTarget(state: EditorState): ClipFrameExportTarget | null {
  // Use the "properties" selector so a video+linked-audio selection still
  // resolves to the video clip (matches the Properties Panel's behavior).
  const clip = selectSelectedClipForProperties(state)
  if (!clip) return null
  const isVideo = clip.type === 'video'
  const liveAsset = selectLiveAssetForClip(state, clip)
  const videoPath = selectClipPath(state, clip)
  const displayLabel = getClipDisplayLabel(clip, liveAsset)
  const { start, end } = computeSeekTimes(clip, liveAsset)
  return {
    clipId: clip.id,
    videoPath,
    displayLabel,
    startSeekTime: start,
    endSeekTime: end,
    isVideo,
  }
}

interface UseClipFrameExportParams {
  projectId: string
}

export function useClipFrameExport({ projectId }: UseClipFrameExportParams) {
  const target = useEditorStore(selectClipFrameExportTarget)

  const [status, setStatus] = useState<FrameExportStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<FrameExportResult[]>([])

  const reset = useCallback(() => {
    setStatus('idle')
    setError(null)
    setResults([])
  }, [])

  const checkTarget = useCallback(async (filename: string) => {
    const api = window.electronAPI
    if (!api) return null
    try {
      const result = await api.checkFrameTargetExists({ projectId, filename })
      if (!result.success) {
        logger.warn(`checkFrameTargetExists failed: ${result.error}`)
        return null
      }
      return {
        exists: result.exists,
        fullPath: result.fullPath,
        autoSuffixedName: result.autoSuffixedName,
        autoSuffixedFullPath: result.autoSuffixedFullPath,
      }
    } catch (err) {
      logger.warn(`checkFrameTargetExists threw: ${err}`)
      return null
    }
  }, [projectId])

  const runExport = useCallback(async (
    videoPath: string,
    entries: FrameExportRequestEntry[],
  ): Promise<boolean> => {
    const api = window.electronAPI
    if (!api) {
      setError('Electron bridge not available')
      setStatus('error')
      return false
    }

    setStatus('exporting')
    setError(null)
    setResults([])

    const out: FrameExportResult[] = []
    for (const entry of entries) {
      const result = await api.exportClipFrame({
        projectId,
        videoPath,
        seekTime: entry.seekTime,
        filename: entry.filename,
        collisionMode: entry.collisionMode,
      })
      if (!result.success) {
        setError(result.error)
        setStatus('error')
        setResults(out)
        return false
      }
      out.push({ kind: entry.kind, outputPath: result.outputPath })
    }

    setResults(out)
    setStatus('done')
    return true
  }, [projectId])

  return {
    target,
    status,
    error,
    results,
    reset,
    runExport,
    checkTarget,
  }
}
