import fs from 'fs'
import path from 'path'
import { getProjectAssetsPath } from './app-state'

const FRAMES_DIR_NAME = 'frames'

export type FrameCollisionMode = 'overwrite' | 'auto-suffix'

export interface FrameTargetInfo {
  exists: boolean
  fullPath: string
  autoSuffixedName: string
  autoSuffixedFullPath: string
}

export function projectFramesRoot(projectId: string): string {
  if (!projectId || /[\\/]/.test(projectId) || projectId === '.' || projectId === '..') {
    throw new Error('Invalid projectId')
  }
  return path.join(getProjectAssetsPath(), projectId, FRAMES_DIR_NAME)
}

// Replace characters that are problematic across platforms (Windows + POSIX)
// while keeping the user's intent recognizable. Allows letters, digits, spaces,
// and a small set of punctuation. Disallows path separators, control chars,
// drive specifiers, and the parent-dir token.
export function sanitizeFrameFilename(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Filename cannot be empty')
  if (/[\\/]/.test(trimmed)) throw new Error('Filename cannot contain path separators')
  if (trimmed === '.' || trimmed === '..') throw new Error('Invalid filename')
  // Reject control chars and the small set Windows forbids: <>:"|?*
  if (/[\x00-\x1f<>:"|?*]/.test(trimmed)) {
    throw new Error('Filename contains invalid characters')
  }
  return trimmed
}

function suffixedName(filename: string, idx: number): string {
  const parsed = path.parse(filename)
  return `${parsed.name}-${idx}${parsed.ext}`
}

export function nextAvailableName(dir: string, filename: string): string {
  let candidate = filename
  let idx = 1
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = suffixedName(filename, idx)
    idx += 1
  }
  return candidate
}

export function inspectFrameTarget(projectId: string, filename: string): FrameTargetInfo {
  const safe = sanitizeFrameFilename(filename)
  const dir = projectFramesRoot(projectId)
  const fullPath = path.join(dir, safe)
  const exists = fs.existsSync(fullPath)
  const autoSuffixedName = exists ? nextAvailableName(dir, safe) : safe
  const autoSuffixedFullPath = path.join(dir, autoSuffixedName)
  return { exists, fullPath, autoSuffixedName, autoSuffixedFullPath }
}

export function resolveFrameOutputPath(
  projectId: string,
  filename: string,
  collisionMode: FrameCollisionMode,
): string {
  const safe = sanitizeFrameFilename(filename)
  const dir = projectFramesRoot(projectId)
  fs.mkdirSync(dir, { recursive: true })
  if (collisionMode === 'overwrite') {
    return path.join(dir, safe)
  }
  return path.join(dir, nextAvailableName(dir, safe))
}
