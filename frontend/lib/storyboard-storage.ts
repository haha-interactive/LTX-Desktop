import { z } from 'zod'
import { logger } from './logger'

export const STORYBOARD_STORAGE_KEY_PREFIX = 'ltx-storyboard-'

export function getStoryboardStorageKey(projectId: string): string {
  return `${STORYBOARD_STORAGE_KEY_PREFIX}${projectId}`
}

export const storyboardItemSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  takeIndex: z.number().optional(),
})

export const storyboardDocumentSchema = z.object({
  version: z.literal(1),
  items: z.array(storyboardItemSchema),
})

export type StoryboardItem = z.infer<typeof storyboardItemSchema>
export type StoryboardDocument = z.infer<typeof storyboardDocumentSchema>

export function emptyStoryboardDocument(): StoryboardDocument {
  return { version: 1, items: [] }
}

export function readStoryboard(projectId: string): StoryboardDocument {
  try {
    const stored = localStorage.getItem(getStoryboardStorageKey(projectId))
    if (!stored) return emptyStoryboardDocument()
    const parsed = JSON.parse(stored) as unknown
    const result = storyboardDocumentSchema.safeParse(parsed)
    if (!result.success) {
      logger.warn(`Storyboard for ${projectId} failed schema validation; resetting`)
      return emptyStoryboardDocument()
    }
    return result.data
  } catch (error) {
    logger.error(`Failed to read storyboard ${projectId}: ${error}`)
    return emptyStoryboardDocument()
  }
}

export function writeStoryboard(projectId: string, doc: StoryboardDocument): void {
  try {
    const validated = storyboardDocumentSchema.parse(doc)
    localStorage.setItem(getStoryboardStorageKey(projectId), JSON.stringify(validated))
  } catch (error) {
    logger.error(`Failed to write storyboard ${projectId}: ${error}`)
  }
}

export function deleteStoryboard(projectId: string): void {
  localStorage.removeItem(getStoryboardStorageKey(projectId))
}
