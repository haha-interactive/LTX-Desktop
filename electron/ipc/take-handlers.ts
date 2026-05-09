import { dialog } from 'electron'
import path from 'path'
import { logger } from '../logger'
import { getMainWindow } from '../window'
import { approvePath } from '../path-validation'
import { loadTakeFolder } from '../take-manifest'
import { handle } from './typed-handle'

export function registerTakeHandlers(): void {
  handle('pickAndLoadTakeFolder', async ({ projectId }) => {
    try {
      const mainWindow = getMainWindow()
      if (!mainWindow) return { success: false, error: 'No window' }
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Take Folder',
        properties: ['openDirectory'],
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'cancelled' }
      }
      const folderPath = path.resolve(result.filePaths[0])
      approvePath(folderPath)
      const folder = loadTakeFolder(folderPath, projectId)
      return { success: true, ...folder }
    } catch (error) {
      logger.error(`Error loading take folder: ${error}`)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  handle('loadTakeFolder', ({ folderPath, projectId }) => {
    try {
      const resolved = path.resolve(folderPath)
      approvePath(resolved)
      const folder = loadTakeFolder(resolved, projectId)
      return { success: true, ...folder }
    } catch (error) {
      logger.error(`Error loading take folder: ${error}`)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}
