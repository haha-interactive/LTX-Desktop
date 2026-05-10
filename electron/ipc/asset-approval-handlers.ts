import path from 'path'
import { logger } from '../logger'
import { approvePath } from '../path-validation'
import { handle } from './typed-handle'

export function registerAssetApprovalHandlers(): void {
  handle('approveAssetPaths', ({ paths }) => {
    try {
      const seen = new Set<string>()
      let count = 0
      for (const p of paths) {
        if (!p) continue
        const dir = path.dirname(p)
        if (!dir || dir === '.' || dir === '/' || dir === path.sep) continue
        if (seen.has(dir)) continue
        seen.add(dir)
        approvePath(dir)
        count += 1
      }
      return { success: true, count }
    } catch (error) {
      logger.error(`approveAssetPaths failed: ${error}`)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}
