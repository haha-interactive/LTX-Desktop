import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { findFfmpegPath } from './export/ffmpeg-utils'
import { getProjectAssetsPath } from './app-state'
import {
  DURATION_EPSILON_SECONDS,
  loadTakeFolder,
  takeManifestSchema,
  type TakeFolderResult,
  type TakeManifest,
} from './take-manifest'

const TAKES_DIR_NAME = 'takes'
const MANIFEST_FILENAME = 'takes.json'
const TAKE_FILE_REGEX = /^take_(\d+)\.mp4$/

export interface TakesFolderSummary {
  name: string
  path: string
  takeCount: number
  baseDuration: number | null
}

export interface PrepareTargetResult {
  folderPath: string
  takeFilename: string
  append: boolean
  baseDuration: number | null
}

function projectTakesRoot(projectId: string): string {
  return path.join(getProjectAssetsPath(), projectId, TAKES_DIR_NAME)
}

export function probeDurationSeconds(videoPath: string): number {
  const ffmpegPath = findFfmpegPath()
  if (!ffmpegPath) throw new Error('ffmpeg not found')
  const result = spawnSync(ffmpegPath, ['-hide_banner', '-i', videoPath], {
    encoding: 'utf8',
    timeout: 10000,
  })
  const output = `${result.stdout || ''}\n${result.stderr || ''}`
  const match = output.match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
  if (!match) throw new Error(`Could not determine duration for ${videoPath}`)
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`Invalid duration for ${videoPath}: ${match[0]}`)
  }
  return seconds
}

export function readManifestSafe(folderPath: string): TakeManifest | null {
  const manifestPath = path.join(folderPath, MANIFEST_FILENAME)
  if (!fs.existsSync(manifestPath)) return null
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    const result = takeManifestSchema.safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function writeManifestAtomic(folderPath: string, manifest: TakeManifest): void {
  const validated = takeManifestSchema.parse(manifest)
  const manifestPath = path.join(folderPath, MANIFEST_FILENAME)
  const tmpPath = path.join(folderPath, `${MANIFEST_FILENAME}.tmp-${process.pid}-${Date.now()}`)
  fs.writeFileSync(tmpPath, JSON.stringify(validated, null, 2), 'utf-8')
  fs.renameSync(tmpPath, manifestPath)
}

function sanitizeFolderName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Folder name cannot be empty')
  if (/[\\/]/.test(trimmed)) throw new Error('Folder name cannot contain path separators')
  if (trimmed === '.' || trimmed === '..') throw new Error('Invalid folder name')
  return trimmed
}

export function listProjectTakesFolders(projectId: string): TakesFolderSummary[] {
  const root = projectTakesRoot(projectId)
  fs.mkdirSync(root, { recursive: true })
  const entries = fs.readdirSync(root, { withFileTypes: true })
  const out: TakesFolderSummary[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const folderPath = path.join(root, entry.name)
    const manifest = readManifestSafe(folderPath)
    if (!manifest) continue
    let baseDuration: number | null = null
    const firstFile = manifest.takes[0]?.file
    if (firstFile) {
      const firstAbs = path.join(folderPath, firstFile)
      if (fs.existsSync(firstAbs)) {
        try {
          baseDuration = probeDurationSeconds(firstAbs)
        } catch {
          baseDuration = null
        }
      }
    }
    out.push({
      name: entry.name,
      path: folderPath,
      takeCount: manifest.takes.length,
      baseDuration,
    })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

export function nextTakeFilename(folderPath: string, manifest: TakeManifest | null): string {
  let maxOnDisk = 0
  if (fs.existsSync(folderPath)) {
    for (const name of fs.readdirSync(folderPath)) {
      const m = name.match(TAKE_FILE_REGEX)
      if (m) maxOnDisk = Math.max(maxOnDisk, Number(m[1]))
    }
  }
  const fromManifest = manifest?.takes.length ?? 0
  const next = Math.max(fromManifest, maxOnDisk) + 1
  return `take_${String(next).padStart(3, '0')}.mp4`
}

export function prepareTakesFolderTarget(input: {
  projectId: string
  mode: 'create' | 'append'
  folderName: string
  expectedDuration: number
}): PrepareTargetResult {
  const sanitized = sanitizeFolderName(input.folderName)
  const root = projectTakesRoot(input.projectId)
  const folderPath = path.join(root, sanitized)

  if (input.mode === 'create') {
    if (fs.existsSync(folderPath)) {
      throw new Error(`A takes folder named '${sanitized}' already exists. Pick a different name or choose Append.`)
    }
    fs.mkdirSync(folderPath, { recursive: true })
    return {
      folderPath,
      takeFilename: nextTakeFilename(folderPath, null),
      append: false,
      baseDuration: null,
    }
  }

  // append
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    throw new Error(`Takes folder '${sanitized}' not found`)
  }
  const manifest = readManifestSafe(folderPath)
  if (!manifest) {
    throw new Error(`'${sanitized}' has no valid ${MANIFEST_FILENAME}; cannot append`)
  }
  const firstFile = manifest.takes[0]?.file
  if (!firstFile) {
    throw new Error(`'${sanitized}' has an empty manifest; cannot append`)
  }
  const firstAbs = path.join(folderPath, firstFile)
  if (!fs.existsSync(firstAbs)) {
    throw new Error(`First take '${firstFile}' missing from disk; manifest is broken`)
  }
  const baseDuration = probeDurationSeconds(firstAbs)
  if (Math.abs(baseDuration - input.expectedDuration) > DURATION_EPSILON_SECONDS) {
    throw new Error(
      `Selection duration (${input.expectedDuration.toFixed(3)}s) does not match folder base duration (${baseDuration.toFixed(3)}s). ` +
      `Create a new folder instead, or trim the selection to match.`
    )
  }
  return {
    folderPath,
    takeFilename: nextTakeFilename(folderPath, manifest),
    append: true,
    baseDuration,
  }
}

export function commitTakeManifest(input: {
  folderPath: string
  takeFilename: string
  label?: string
  projectId: string
}): TakeFolderResult {
  const folderResolved = path.resolve(input.folderPath)
  const takeAbs = path.join(folderResolved, input.takeFilename)
  if (!fs.existsSync(takeAbs)) {
    throw new Error(`Rendered take file not found: ${takeAbs}`)
  }

  const existing = readManifestSafe(folderResolved)
  const nextManifest: TakeManifest = existing
    ? {
        ...existing,
        selected: input.takeFilename,
        takes: [
          ...existing.takes,
          { file: input.takeFilename, ...(input.label ? { label: input.label } : {}) },
        ],
      }
    : {
        version: 1,
        selected: input.takeFilename,
        takes: [{ file: input.takeFilename, ...(input.label ? { label: input.label } : {}) }],
      }

  try {
    writeManifestAtomic(folderResolved, nextManifest)
  } catch (err) {
    // Orphan cleanup so a failed manifest write does not leave a dangling MP4.
    try { fs.unlinkSync(takeAbs) } catch { /* ignore */ }
    throw err
  }

  return loadTakeFolder(folderResolved, input.projectId)
}
