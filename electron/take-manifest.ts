import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { z } from 'zod'
import { findFfmpegPath, getVideoDimensions } from './export/ffmpeg-utils'
import { getProjectAssetsPath } from './app-state'
import { approvePath } from './path-validation'
import { createDownsampledThumbnail, getThumbnailPaths } from './ipc/image-utils'
import { extractVideoFrameToFile } from './export/ffmpeg-utils'

const TAKES_MANIFEST_FILENAME = 'takes.json'

interface VideoProbe {
  width: number
  height: number
  duration: number
}

function probeVideo(videoPath: string): VideoProbe {
  const ffmpegPath = findFfmpegPath()
  if (!ffmpegPath) throw new Error('ffmpeg not found')
  if (!fs.existsSync(videoPath)) throw new Error(`Video file not found: ${videoPath}`)
  const result = spawnSync(ffmpegPath, ['-hide_banner', '-i', videoPath], {
    encoding: 'utf8',
    timeout: 10000,
  })
  const output = `${result.stdout || ''}\n${result.stderr || ''}`
  const durMatch = output.match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
  if (!durMatch) throw new Error(`Could not determine video duration for ${videoPath}`)
  const duration = Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3])
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Invalid video duration for ${videoPath}: ${durMatch[0]}`)
  }
  const { width, height } = getVideoDimensions(videoPath)
  return { width, height, duration }
}

// One frame at 24fps; tolerated mismatch between takes.
export const DURATION_EPSILON_SECONDS = 1 / 24

const takeEntrySchema = z.object({
  file: z.string().min(1),
  label: z.string().optional(),
})

export const takeManifestSchema = z.object({
  version: z.literal(1),
  name: z.string().optional(),
  selected: z.string().optional(),
  takes: z.array(takeEntrySchema).min(1),
})

export type TakeManifest = z.infer<typeof takeManifestSchema>

export interface ResolvedTake {
  path: string
  bigThumbnailPath: string
  smallThumbnailPath: string
  width: number
  height: number
  createdAt: number
  label?: string
}

export interface TakeFolderResult {
  sourceFolder: string
  displayName: string
  duration: number
  activeTakeIndex: number
  takes: ResolvedTake[]
}

function readManifest(folderPath: string): TakeManifest {
  const manifestPath = path.join(folderPath, TAKES_MANIFEST_FILENAME)
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`)
  }
  let raw: string
  try {
    raw = fs.readFileSync(manifestPath, 'utf-8')
  } catch (err) {
    throw new Error(`Could not read ${TAKES_MANIFEST_FILENAME}: ${String(err)}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`Invalid JSON in ${TAKES_MANIFEST_FILENAME}: ${String(err)}`)
  }
  const result = takeManifestSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`Manifest schema error: ${result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
  }
  return result.data
}

function resolveTakeFile(folderPath: string, file: string): string {
  if (path.isAbsolute(file)) {
    throw new Error(`Manifest take path must be relative to the manifest folder, got absolute: ${file}`)
  }
  const resolved = path.resolve(folderPath, file)
  const folderResolved = path.resolve(folderPath)
  if (!resolved.startsWith(folderResolved + path.sep) && resolved !== folderResolved) {
    throw new Error(`Manifest take path escapes folder: ${file}`)
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Take file not found: ${resolved}`)
  }
  if (!fs.statSync(resolved).isFile()) {
    throw new Error(`Take path is not a file: ${resolved}`)
  }
  return resolved
}

function takeThumbDir(projectId: string): string {
  const root = getProjectAssetsPath()
  const dir = path.join(root, projectId, '_take_thumbs')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function buildThumbnailsForTake(
  videoPath: string,
  thumbDir: string,
  folderName: string,
  fileBase: string,
): { bigThumbnailPath: string; smallThumbnailPath: string } {
  const safeFolder = folderName.replace(/[^a-zA-Z0-9_-]/g, '_')
  const safeBase = fileBase.replace(/[^a-zA-Z0-9_-]/g, '_')
  const stem = `${safeFolder}__${safeBase}`
  // Use a stable name; reuse existing helper layout by routing into thumbDir.
  const pseudoAssetPath = path.join(thumbDir, `${stem}.mp4`)
  const { bigThumbnailPath, smallThumbnailPath } = getThumbnailPaths(pseudoAssetPath)
  extractVideoFrameToFile({
    videoPath,
    seekTime: 0,
    outputPath: bigThumbnailPath,
    timeoutMs: 30000,
  })
  createDownsampledThumbnail(bigThumbnailPath, smallThumbnailPath)
  return { bigThumbnailPath, smallThumbnailPath }
}

export function loadTakeFolder(folderPath: string, projectId: string): TakeFolderResult {
  const folderResolved = path.resolve(folderPath)
  if (!fs.existsSync(folderResolved) || !fs.statSync(folderResolved).isDirectory()) {
    throw new Error(`Take folder not found: ${folderResolved}`)
  }
  const manifest = readManifest(folderResolved)

  const seen = new Set<string>()
  for (const t of manifest.takes) {
    if (seen.has(t.file)) {
      throw new Error(`Duplicate take file in manifest: ${t.file}`)
    }
    seen.add(t.file)
  }

  let activeTakeIndex = 0
  if (manifest.selected) {
    const idx = manifest.takes.findIndex(t => t.file === manifest.selected)
    if (idx < 0) {
      throw new Error(`Manifest 'selected' value '${manifest.selected}' does not match any take file`)
    }
    activeTakeIndex = idx
  }

  const probes = manifest.takes.map(entry => {
    const absPath = resolveTakeFile(folderResolved, entry.file)
    const probe = probeVideo(absPath)
    return { entry, absPath, probe }
  })

  const baseDuration = probes[0].probe.duration
  const outliers = probes
    .filter(p => Math.abs(p.probe.duration - baseDuration) > DURATION_EPSILON_SECONDS)
    .map(p => `${p.entry.file}=${p.probe.duration.toFixed(2)}s`)
  if (outliers.length > 0) {
    const reference = `${probes[0].entry.file}=${baseDuration.toFixed(2)}s`
    throw new Error(`Take durations differ (must match within ${DURATION_EPSILON_SECONDS.toFixed(3)}s): reference ${reference}; outliers: ${outliers.join(', ')}`)
  }

  approvePath(folderResolved)

  const folderName = path.basename(folderResolved)
  const thumbDir = takeThumbDir(projectId)
  const now = Date.now()

  const takes: ResolvedTake[] = probes.map(({ entry, absPath, probe }) => {
    const fileBase = path.parse(entry.file).name
    const { bigThumbnailPath, smallThumbnailPath } = buildThumbnailsForTake(
      absPath,
      thumbDir,
      folderName,
      fileBase,
    )
    return {
      path: absPath,
      bigThumbnailPath,
      smallThumbnailPath,
      width: probe.width,
      height: probe.height,
      createdAt: now,
      ...(entry.label ? { label: entry.label } : {}),
    }
  })

  return {
    sourceFolder: folderResolved,
    displayName: manifest.name?.trim() || folderName,
    duration: baseDuration,
    activeTakeIndex,
    takes,
  }
}
