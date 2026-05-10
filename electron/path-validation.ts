import path from 'path'

const isWindows = process.platform === 'win32'

function normalize(p: string): string {
  return isWindows ? path.resolve(p).toLowerCase() : path.resolve(p)
}

function stripFileUrl(fileUrl: string): string {
  let raw = fileUrl
  if (raw.startsWith('file://')) raw = raw.slice(7)
  // On Windows the URL is file:///C:/... so after stripping `file://` the path
  // starts with `/C:/...`; the leading slash must be removed. On Unix the path
  // is already correct (`/home/...`), the leading slash MUST be preserved.
  if (isWindows && /^\/[A-Za-z]:/.test(raw)) raw = raw.slice(1)
  // Strip any query/fragment that callers (e.g. cache-busting `?v=...` on
  // pathToFileUrl outputs) may have appended; a real filesystem path can't
  // contain these anyway.
  const queryIdx = raw.indexOf('?')
  if (queryIdx >= 0) raw = raw.slice(0, queryIdx)
  const hashIdx = raw.indexOf('#')
  if (hashIdx >= 0) raw = raw.slice(0, hashIdx)
  return decodeURIComponent(raw).replace(/\//g, path.sep)
}

const approvedPaths = new Set<string>()

export function approvePath(filePath: string): void {
  approvedPaths.add(normalize(filePath))
}

export function validatePath(inputPath: string, allowedRoots: string[]): string {
  const cleaned = inputPath.startsWith('file://') ? stripFileUrl(inputPath) : inputPath
  const resolved = path.resolve(cleaned)
  const norm = normalize(resolved)

  for (const root of allowedRoots.map(normalize)) {
    if (norm === root || norm.startsWith(root + path.sep)) return resolved
  }

  let found = false
  approvedPaths.forEach((approved) => {
    if (norm === approved || norm.startsWith(approved + path.sep)) found = true
  })
  if (found) return resolved

  throw new Error(`Path not allowed: ${inputPath}`)
}
