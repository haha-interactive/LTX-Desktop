import { logger } from '../logger'
import { approvePath } from '../path-validation'
import {
  commitTakeManifest,
  listProjectTakesFolders,
  prepareTakesFolderTarget,
} from '../take-export'
import { handle } from './typed-handle'

function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function registerTakeExportHandlers(): void {
  handle('listProjectTakesFolders', ({ projectId }) => {
    try {
      const folders = listProjectTakesFolders(projectId)
      return { success: true, folders }
    } catch (error) {
      logger.error(`Error listing takes folders: ${error}`)
      return { success: false, error: errMessage(error) }
    }
  })

  handle('prepareTakesFolderTarget', (input) => {
    try {
      const result = prepareTakesFolderTarget(input)
      // Approve the rendered output path so subsequent exportNative calls pass validation.
      approvePath(result.folderPath)
      return { success: true, ...result }
    } catch (error) {
      logger.error(`Error preparing takes folder: ${error}`)
      return { success: false, error: errMessage(error) }
    }
  })

  handle('commitTakeManifest', (input) => {
    try {
      const folder = commitTakeManifest(input)
      return { success: true, ...folder }
    } catch (error) {
      logger.error(`Error committing take manifest: ${error}`)
      return { success: false, error: errMessage(error) }
    }
  })
}
