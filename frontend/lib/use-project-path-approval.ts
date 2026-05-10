import { useEffect, useMemo } from 'react'
import type { Project } from '../types/project-model'
import { logger } from './logger'

function collectAssetPaths(project: Project): string[] {
  const set = new Set<string>()
  for (const asset of project.assets) {
    if (asset.path) set.add(asset.path)
    if (asset.takes) {
      for (const take of asset.takes) {
        if (take.path) set.add(take.path)
      }
    }
  }
  return [...set]
}

/**
 * On project open, approve the parent directories of every asset/take path so
 * subsequent `readLocalFile` / video-element loads pass `validatePath`. The
 * project's own JSON is the source of truth: when assets are added/removed,
 * the next render re-runs the sweep and the approved set re-derives.
 *
 * Approvals are in-memory in the main process. After app restart, this hook
 * runs again on project load and re-approves the same paths.
 */
export function useProjectPathApproval(project: Project | null): void {
  const fingerprint = useMemo(() => {
    if (!project) return ''
    return collectAssetPaths(project).sort().join('|')
  }, [project])

  useEffect(() => {
    if (!project || !fingerprint) return
    const api = window.electronAPI
    if (!api) return
    const paths = collectAssetPaths(project)
    void api.approveAssetPaths({ paths }).catch((err) => {
      logger.warn(`approveAssetPaths failed: ${err}`)
    })
    // fingerprint dependency triggers re-run only when the actual path set changes.
  }, [fingerprint, project])
}
