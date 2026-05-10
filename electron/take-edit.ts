import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import {
  DURATION_EPSILON_SECONDS,
  loadTakeFolder,
  type TakeFolderResult,
  type TakeManifest,
} from './take-manifest'
import {
  nextTakeFilename,
  probeDurationSeconds,
  readManifestSafe,
  writeManifestAtomic,
} from './take-export'
import { findFfmpegPath } from './export/ffmpeg-utils'

function ffmpegTrimToTemp(srcPath: string, startSeconds: number, durationSeconds: number): string {
  const ffmpegPath = findFfmpegPath()
  if (!ffmpegPath) throw new Error('ffmpeg not found')
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltx-take-trim-'))
  const tempOut = path.join(tempDir, `trimmed_${Date.now()}.mp4`)
  // Re-encode for frame-accurate trim. Output -ss after -i ensures accuracy
  // even when the source isn't keyframe-aligned at the start; libx264/aac
  // keeps duration exact across formats.
  const args = [
    '-y',
    '-i', srcPath,
    '-ss', startSeconds.toFixed(3),
    '-t', durationSeconds.toFixed(3),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '18',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    tempOut,
  ]
  const result = spawnSync(ffmpegPath, args, { timeout: 120000 })
  if (result.status !== 0) {
    const stderr = (result.stderr?.toString() || '').split('\n').filter(Boolean).slice(-5).join('\n')
    try { fs.rmSync(tempDir, { recursive: true, force: true }) } catch { /* ignore */ }
    throw new Error(`ffmpeg trim failed (code ${result.status}): ${stderr.slice(0, 300)}`)
  }
  return tempOut
}

export type ReplaceMode = 'overwrite' | 'new-file'

interface ReplaceTakeVideoInput {
  folderPath: string
  takeIndex: number
  srcVideoPath: string
  mode: ReplaceMode
  projectId: string
}

interface UpdateTakeMetadataInput {
  folderPath: string
  takeIndex: number
  patch: { label?: string; prompt?: string; platform?: string }
  projectId: string
}

interface SetTakeFolderSelectedInput {
  folderPath: string
  takeFilename: string
  projectId: string
}

function loadAndValidateForEdit(folderPath: string, takeIndex: number): { manifest: TakeManifest; folderResolved: string; takeEntry: TakeManifest['takes'][number] } {
  const folderResolved = path.resolve(folderPath)
  if (!fs.existsSync(folderResolved) || !fs.statSync(folderResolved).isDirectory()) {
    throw new Error(`Take folder not found: ${folderResolved}`)
  }
  const manifest = readManifestSafe(folderResolved)
  if (!manifest) {
    throw new Error(`Manifest missing or invalid in ${folderResolved}`)
  }
  if (takeIndex < 0 || takeIndex >= manifest.takes.length) {
    throw new Error(`Take index ${takeIndex} out of range (0..${manifest.takes.length - 1})`)
  }
  return { manifest, folderResolved, takeEntry: manifest.takes[takeIndex] }
}

function nextVersionedFilename(folderResolved: string, currentFile: string): string {
  // Generate a fresh filename based on the existing one.
  // Examples:
  //   take_002.mp4 -> take_002_v2.mp4
  //   take_002_v2.mp4 -> take_002_v3.mp4
  const parsed = path.parse(currentFile)
  const stem = parsed.name
  const ext = parsed.ext || '.mp4'
  const versionMatch = stem.match(/^(.*)_v(\d+)$/)
  const baseStem = versionMatch ? versionMatch[1] : stem
  const startVersion = versionMatch ? Number(versionMatch[2]) + 1 : 2
  for (let v = startVersion; v < 1000; v += 1) {
    const candidate = `${baseStem}_v${v}${ext}`
    if (!fs.existsSync(path.join(folderResolved, candidate))) return candidate
  }
  throw new Error('Could not pick a unique filename for replacement (gave up after 1000 attempts)')
}

export function replaceTakeVideo(input: ReplaceTakeVideoInput): TakeFolderResult {
  const { manifest, folderResolved, takeEntry } = loadAndValidateForEdit(input.folderPath, input.takeIndex)

  const srcResolved = path.resolve(input.srcVideoPath)
  if (!fs.existsSync(srcResolved) || !fs.statSync(srcResolved).isFile()) {
    throw new Error(`Source video file not found: ${srcResolved}`)
  }

  // Validate duration against the folder's base duration (first take).
  const baseFile = manifest.takes[0].file
  const baseAbs = path.join(folderResolved, baseFile)
  if (!fs.existsSync(baseAbs)) {
    throw new Error(`Base take '${baseFile}' missing from disk`)
  }
  const baseDuration = probeDurationSeconds(baseAbs)
  const srcDuration = probeDurationSeconds(srcResolved)
  if (Math.abs(baseDuration - srcDuration) > DURATION_EPSILON_SECONDS) {
    throw new Error(
      `New video duration (${srcDuration.toFixed(3)}s) does not match folder base duration (${baseDuration.toFixed(3)}s).`,
    )
  }

  if (input.mode === 'overwrite') {
    const targetAbs = path.join(folderResolved, takeEntry.file)
    fs.copyFileSync(srcResolved, targetAbs)
    // Manifest unchanged; loadTakeFolder regenerates thumbnails (createdAt bumps).
    return loadTakeFolder(folderResolved, input.projectId)
  }

  // new-file mode: write under a new name and update manifest entry's `file`.
  const newName = nextVersionedFilename(folderResolved, takeEntry.file)
  const newAbs = path.join(folderResolved, newName)
  fs.copyFileSync(srcResolved, newAbs)

  const nextManifest: TakeManifest = {
    ...manifest,
    takes: manifest.takes.map((entry, idx) => (
      idx === input.takeIndex ? { ...entry, file: newName } : entry
    )),
    // If the replaced take was the selected one, preserve "selected" by name,
    // pointing at the new filename so the manifest stays internally consistent.
    selected: manifest.selected === takeEntry.file ? newName : manifest.selected,
  }

  try {
    writeManifestAtomic(folderResolved, nextManifest)
  } catch (err) {
    try { fs.unlinkSync(newAbs) } catch { /* ignore */ }
    throw err
  }

  return loadTakeFolder(folderResolved, input.projectId)
}

export function updateTakeMetadata(input: UpdateTakeMetadataInput): TakeFolderResult {
  const { manifest, folderResolved, takeEntry } = loadAndValidateForEdit(input.folderPath, input.takeIndex)

  const patched = { ...takeEntry }
  if ('label' in input.patch) {
    patched.label = input.patch.label?.trim() ? input.patch.label.trim() : undefined
  }
  if ('prompt' in input.patch) {
    patched.prompt = input.patch.prompt?.trim() ? input.patch.prompt.trim() : undefined
  }
  if ('platform' in input.patch) {
    patched.platform = input.patch.platform?.trim() ? input.patch.platform.trim() : undefined
  }

  const nextManifest: TakeManifest = {
    ...manifest,
    takes: manifest.takes.map((entry, idx) => (idx === input.takeIndex ? patched : entry)),
  }

  writeManifestAtomic(folderResolved, nextManifest)
  return loadTakeFolder(folderResolved, input.projectId)
}

export function setTakeFolderSelected(input: SetTakeFolderSelectedInput): TakeFolderResult {
  const folderResolved = path.resolve(input.folderPath)
  const manifest = readManifestSafe(folderResolved)
  if (!manifest) {
    throw new Error(`Manifest missing or invalid in ${folderResolved}`)
  }
  const exists = manifest.takes.some(entry => entry.file === input.takeFilename)
  if (!exists) {
    throw new Error(`No take with filename '${input.takeFilename}' in this folder`)
  }
  const nextManifest: TakeManifest = { ...manifest, selected: input.takeFilename }
  writeManifestAtomic(folderResolved, nextManifest)
  return loadTakeFolder(folderResolved, input.projectId)
}

interface RenameTakeFolderInput {
  folderPath: string
  newName: string
  projectId: string
}

// Updates the manifest's `name` field only — no disk rename. This avoids
// triggering thumbnail regeneration (which would happen if the folder's
// basename changed, since thumbnail filenames are derived from the folder
// name) and avoids updating every linked asset's `sourceFolder` path. The
// displayName surfaced by loadTakeFolder already prefers manifest.name over
// the directory basename, so the UI updates immediately.
export function renameTakeFolder(input: RenameTakeFolderInput): TakeFolderResult {
  const folderResolved = path.resolve(input.folderPath)
  if (!fs.existsSync(folderResolved) || !fs.statSync(folderResolved).isDirectory()) {
    throw new Error(`Take folder not found: ${folderResolved}`)
  }
  const manifest = readManifestSafe(folderResolved)
  if (!manifest) {
    throw new Error(`Manifest missing or invalid in ${folderResolved}`)
  }
  const newName = input.newName.trim()
  if (!newName) {
    throw new Error('Name cannot be empty')
  }
  const nextManifest: TakeManifest = { ...manifest, name: newName }
  writeManifestAtomic(folderResolved, nextManifest)
  return loadTakeFolder(folderResolved, input.projectId)
}

interface AddTakeToFolderInput {
  folderPath: string
  srcVideoPath: string
  metadata?: { label?: string; prompt?: string; platform?: string }
  // Optional trim — when present, the source is re-encoded to a temp file
  // with [start, start + duration] before being copied into the folder.
  // Use when the source video is longer than the folder's base duration.
  trim?: { startSeconds: number; durationSeconds: number }
  projectId: string
}

export function addTakeToFolder(input: AddTakeToFolderInput): TakeFolderResult {
  const folderResolved = path.resolve(input.folderPath)
  if (!fs.existsSync(folderResolved) || !fs.statSync(folderResolved).isDirectory()) {
    throw new Error(`Take folder not found: ${folderResolved}`)
  }
  const manifest = readManifestSafe(folderResolved)
  if (!manifest) {
    throw new Error(`Manifest missing or invalid in ${folderResolved}`)
  }

  const srcResolved = path.resolve(input.srcVideoPath)
  if (!fs.existsSync(srcResolved) || !fs.statSync(srcResolved).isFile()) {
    throw new Error(`Source video file not found: ${srcResolved}`)
  }

  // Duration validation against the folder's base take.
  const baseFile = manifest.takes[0].file
  const baseAbs = path.join(folderResolved, baseFile)
  if (!fs.existsSync(baseAbs)) {
    throw new Error(`Base take '${baseFile}' missing from disk`)
  }
  const baseDuration = probeDurationSeconds(baseAbs)
  const srcDuration = probeDurationSeconds(srcResolved)

  // Pick the actual file to copy. If trimming, re-encode a temp segment first.
  let copySrc = srcResolved
  let trimTempDir: string | null = null
  if (input.trim) {
    if (Math.abs(input.trim.durationSeconds - baseDuration) > DURATION_EPSILON_SECONDS) {
      throw new Error(
        `Trim duration (${input.trim.durationSeconds.toFixed(3)}s) does not match folder base duration (${baseDuration.toFixed(3)}s).`,
      )
    }
    if (input.trim.startSeconds < 0 || input.trim.startSeconds + input.trim.durationSeconds > srcDuration + DURATION_EPSILON_SECONDS) {
      throw new Error(
        `Trim window (${input.trim.startSeconds.toFixed(3)}s..${(input.trim.startSeconds + input.trim.durationSeconds).toFixed(3)}s) is out of bounds for source duration ${srcDuration.toFixed(3)}s.`,
      )
    }
    copySrc = ffmpegTrimToTemp(srcResolved, input.trim.startSeconds, input.trim.durationSeconds)
    trimTempDir = path.dirname(copySrc)
  } else {
    if (Math.abs(baseDuration - srcDuration) > DURATION_EPSILON_SECONDS) {
      throw new Error(
        `New video duration (${srcDuration.toFixed(3)}s) does not match folder base duration (${baseDuration.toFixed(3)}s). ` +
        `Take folders require all videos to share duration within one frame.`,
      )
    }
  }

  const newName = nextTakeFilename(folderResolved, manifest)
  const newAbs = path.join(folderResolved, newName)
  try {
    fs.copyFileSync(copySrc, newAbs)
  } catch (err) {
    if (trimTempDir) { try { fs.rmSync(trimTempDir, { recursive: true, force: true }) } catch { /* ignore */ } }
    throw err
  }
  if (trimTempDir) { try { fs.rmSync(trimTempDir, { recursive: true, force: true }) } catch { /* ignore */ } }

  const meta = input.metadata ?? {}
  const newEntry = {
    file: newName,
    ...(meta.label?.trim() ? { label: meta.label.trim() } : {}),
    ...(meta.prompt?.trim() ? { prompt: meta.prompt.trim() } : {}),
    ...(meta.platform?.trim() ? { platform: meta.platform.trim() } : {}),
  }
  const nextManifest: TakeManifest = {
    ...manifest,
    takes: [...manifest.takes, newEntry],
    // selected unchanged — user explicitly promotes via Set default if desired.
  }

  try {
    writeManifestAtomic(folderResolved, nextManifest)
  } catch (err) {
    try { fs.unlinkSync(newAbs) } catch { /* ignore */ }
    throw err
  }

  return loadTakeFolder(folderResolved, input.projectId)
}

export function probeVideoDurationSeconds(srcVideoPath: string): number {
  const resolved = path.resolve(srcVideoPath)
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`Video file not found: ${resolved}`)
  }
  return probeDurationSeconds(resolved)
}
