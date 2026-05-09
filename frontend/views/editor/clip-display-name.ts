import type { Asset, TimelineClip } from '../../types/project-model'

export function getActiveTakeLabel(
  clip: TimelineClip,
  liveAsset: Asset | null | undefined,
): string | undefined {
  if (!liveAsset?.takes || liveAsset.takes.length === 0) return undefined
  const takeIdx = clip.takeIndex ?? liveAsset.activeTakeIndex
  if (takeIdx === undefined) return undefined
  const idx = Math.max(0, Math.min(takeIdx, liveAsset.takes.length - 1))
  return liveAsset.takes[idx].label
}

export function getClipDisplayLabel(
  clip: TimelineClip,
  liveAsset: Asset | null | undefined,
): string {
  return (
    getActiveTakeLabel(clip, liveAsset)?.slice(0, 30)
    || clip.asset?.prompt?.slice(0, 30)
    || clip.importedName
    || 'Clip'
  )
}
