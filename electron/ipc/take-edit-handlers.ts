import { logger } from '../logger'
import {
  addTakeToFolder,
  probeVideoDurationSeconds,
  renameTakeFolder,
  replaceTakeVideo,
  setTakeFolderSelected,
  updateTakeMetadata,
} from '../take-edit'
import { handle } from './typed-handle'

function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function registerTakeEditHandlers(): void {
  handle('replaceTakeVideo', (input) => {
    try {
      const folder = replaceTakeVideo(input)
      return { success: true, ...folder }
    } catch (error) {
      logger.error(`Error replacing take video: ${error}`)
      return { success: false, error: errMessage(error) }
    }
  })

  handle('updateTakeMetadata', (input) => {
    try {
      const folder = updateTakeMetadata(input)
      return { success: true, ...folder }
    } catch (error) {
      logger.error(`Error updating take metadata: ${error}`)
      return { success: false, error: errMessage(error) }
    }
  })

  handle('setTakeFolderSelected', (input) => {
    try {
      const folder = setTakeFolderSelected(input)
      return { success: true, ...folder }
    } catch (error) {
      logger.error(`Error setting take folder selected: ${error}`)
      return { success: false, error: errMessage(error) }
    }
  })

  handle('addTakeToFolder', (input) => {
    try {
      const folder = addTakeToFolder(input)
      return { success: true, ...folder }
    } catch (error) {
      logger.error(`Error adding take to folder: ${error}`)
      return { success: false, error: errMessage(error) }
    }
  })

  handle('renameTakeFolder', (input) => {
    try {
      const result = renameTakeFolder(input)
      return { success: true, ...result }
    } catch (error) {
      logger.error(`Error renaming take folder: ${error}`)
      return { success: false, error: errMessage(error) }
    }
  })

  handle('probeVideoDuration', ({ srcVideoPath }) => {
    try {
      const durationSeconds = probeVideoDurationSeconds(srcVideoPath)
      return { success: true, durationSeconds }
    } catch (error) {
      logger.error(`Error probing video duration: ${error}`)
      return { success: false, error: errMessage(error) }
    }
  })
}
