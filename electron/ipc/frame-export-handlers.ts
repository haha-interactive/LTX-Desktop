import fs from 'fs'
import { getAllowedRoots } from '../config'
import { logger } from '../logger'
import { approvePath, validatePath } from '../path-validation'
import { extractVideoFrameToFile } from '../export/ffmpeg-utils'
import {
  inspectFrameTarget,
  resolveFrameOutputPath,
} from '../frame-export'
import { handle } from './typed-handle'

function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function registerFrameExportHandlers(): void {
  handle('checkFrameTargetExists', ({ projectId, filename }) => {
    try {
      const info = inspectFrameTarget(projectId, filename)
      return {
        success: true,
        exists: info.exists,
        fullPath: info.fullPath,
        autoSuffixedName: info.autoSuffixedName,
        autoSuffixedFullPath: info.autoSuffixedFullPath,
      }
    } catch (error) {
      return { success: false, error: errMessage(error) }
    }
  })

  handle('exportClipFrame', ({ projectId, videoPath, seekTime, filename, collisionMode }) => {
    try {
      validatePath(videoPath, getAllowedRoots())
      if (!fs.existsSync(videoPath)) {
        throw new Error(`Source video not found: ${videoPath}`)
      }
      const outputPath = resolveFrameOutputPath(projectId, filename, collisionMode)
      // Approve so subsequent reads (e.g. revealing in folder) pass validation.
      approvePath(outputPath)
      extractVideoFrameToFile({
        videoPath,
        seekTime: Math.max(0, seekTime),
        outputPath,
        timeoutMs: 15000,
      })
      return { success: true, outputPath }
    } catch (error) {
      logger.error(`Error exporting clip frame: ${error}`)
      return { success: false, error: errMessage(error) }
    }
  })
}
