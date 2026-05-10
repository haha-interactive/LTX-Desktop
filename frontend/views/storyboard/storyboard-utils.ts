import type { Asset, AssetTake, Project, Timeline, TimelineClip, Track } from '../../types/project-model'
import { DEFAULT_COLOR_CORRECTION, DEFAULT_TRACKS } from '../../types/project-model'
import { createTimelineClipFromAsset, makeId } from '../editor/editor-actions'
import type { StoryboardItem } from '../../lib/storyboard-storage'

export interface ResolvedStoryboardItem {
  item: StoryboardItem
  asset: Asset
  take: AssetTake | null
  effectiveTakeIndex: number | undefined
  duration: number
  thumbnailPath: string | undefined
  displayName: string
}

const FALLBACK_DURATION_SECONDS = 5

export function resolveStoryboardItem(item: StoryboardItem, project: Project): ResolvedStoryboardItem | null {
  const asset = project.assets.find(a => a.id === item.assetId)
  if (!asset) return null
  if (asset.type === 'audio' || asset.type === 'adjustment') return null

  const effectiveTakeIndex = item.takeIndex ?? asset.activeTakeIndex
  let take: AssetTake | null = null
  if (asset.takes && asset.takes.length > 0 && effectiveTakeIndex !== undefined) {
    const idx = Math.max(0, Math.min(effectiveTakeIndex, asset.takes.length - 1))
    take = asset.takes[idx]
  }

  // Duration: prefer take's, fall back to asset's, then constant.
  const duration = (take && asset.type === 'video' ? asset.duration : asset.duration)
    ?? (asset.type === 'image' ? FALLBACK_DURATION_SECONDS : FALLBACK_DURATION_SECONDS)

  const thumbnailPath = take?.smallThumbnailPath ?? asset.smallThumbnailPath
  const displayName = (asset.prompt && asset.prompt.trim())
    || asset.path.split(/[\\/]/).pop()
    || 'Untitled'

  return {
    item,
    asset,
    take,
    effectiveTakeIndex,
    duration,
    thumbnailPath,
    displayName,
  }
}

export function resolveStoryboardItems(items: StoryboardItem[], project: Project): ResolvedStoryboardItem[] {
  const out: ResolvedStoryboardItem[] = []
  for (const item of items) {
    const resolved = resolveStoryboardItem(item, project)
    if (resolved) out.push(resolved)
  }
  return out
}

export function computeTotalDuration(items: StoryboardItem[], project: Project): number {
  return resolveStoryboardItems(items, project).reduce((sum, r) => sum + r.duration, 0)
}

export function nextStoryboardTimelineName(timelines: Timeline[]): string {
  const re = /^Storyboard Timeline (\d+)$/
  const used = timelines
    .map(t => t.name.match(re))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map(m => Number(m[1]))
  const next = used.length > 0 ? Math.max(...used) + 1 : 1
  return `Storyboard Timeline ${next}`
}

export function materializeStoryboardTimeline(
  items: StoryboardItem[],
  project: Project,
): { timeline: Timeline } | null {
  const resolved = resolveStoryboardItems(items, project)
  if (resolved.length === 0) return null

  const tracks: Track[] = DEFAULT_TRACKS.map(t => ({ ...t }))
  const v1Index = tracks.findIndex(t => t.kind === 'video')
  const a1Index = tracks.findIndex(t => t.kind === 'audio')

  let cursor = 0
  const clips: TimelineClip[] = []
  for (const r of resolved) {
    const videoId = makeId('clip')
    const audioId = r.asset.type === 'video' ? makeId('clip-audio') : null

    const baseClip = createTimelineClipFromAsset(r.asset, v1Index, cursor)
    const videoClip: TimelineClip = {
      ...baseClip,
      id: videoId,
      duration: r.duration,
      ...(r.effectiveTakeIndex !== undefined ? { takeIndex: r.effectiveTakeIndex } : {}),
      muted: audioId !== null,
      ...(audioId ? { linkedClipIds: [audioId] } : {}),
    }
    clips.push(videoClip)

    if (audioId !== null) {
      clips.push({
        id: audioId,
        assetId: r.asset.id,
        type: 'audio',
        startTime: cursor,
        duration: r.duration,
        trimStart: 0,
        trimEnd: 0,
        speed: 1,
        reversed: false,
        muted: false,
        volume: 1,
        trackIndex: a1Index,
        asset: r.asset,
        flipH: false,
        flipV: false,
        transitionIn: { type: 'none', duration: 0 },
        transitionOut: { type: 'none', duration: 0 },
        colorCorrection: { ...DEFAULT_COLOR_CORRECTION },
        opacity: 100,
        ...(r.effectiveTakeIndex !== undefined ? { takeIndex: r.effectiveTakeIndex } : {}),
        linkedClipIds: [videoId],
      })
    }
    cursor += r.duration
  }

  const timeline: Timeline = {
    id: makeId('timeline'),
    name: nextStoryboardTimelineName(project.timelines),
    createdAt: Date.now(),
    tracks,
    clips,
    subtitles: [],
  }
  return { timeline }
}

export function storyboardItemsFromTimeline(timeline: Timeline): StoryboardItem[] {
  // Pick the topmost video track (lowest trackIndex among video/image clips).
  // DEFAULT_TRACKS has V1 at index 0, so usually trackIndex 0 is V1.
  const videoClips = timeline.clips.filter(c => c.type === 'video' || c.type === 'image')
  if (videoClips.length === 0) return []
  const topTrackIndex = Math.min(...videoClips.map(c => c.trackIndex))
  const v1 = videoClips
    .filter(c => c.trackIndex === topTrackIndex && c.assetId)
    .sort((a, b) => a.startTime - b.startTime)
  return v1.map(c => ({
    id: makeId('sb-item'),
    assetId: c.assetId as string,
    ...(c.takeIndex !== undefined ? { takeIndex: c.takeIndex } : {}),
  }))
}

// --- FCPXML (self-contained; intentionally duplicated from ExportModal so we
// don't have to touch that file). ---

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function buildFcpxmlFromStoryboard(
  items: StoryboardItem[],
  project: Project,
  projectName: string,
  timelineName: string,
  fps = 24,
): string | null {
  const result = materializeStoryboardTimeline(items, project)
  if (!result) return null
  return buildFcpxmlFromClips(result.timeline.clips, result.timeline.tracks, projectName, timelineName, fps)
}

function buildFcpxmlFromClips(
  clips: TimelineClip[],
  tracks: Track[],
  projectName: string,
  timelineName: string,
  fps: number,
): string {
  const frameDuration = `${Math.round(100 * fps)}/${100 * fps}s`
  const totalDuration = clips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0)
  const totalFrames = Math.ceil(totalDuration * fps)

  const assetEntries: string[] = []
  const seenAssets = new Set<string>()
  for (const clip of clips) {
    const assetId = clip.assetId || clip.id
    if (seenAssets.has(assetId)) continue
    seenAssets.add(assetId)
    const assetPath = clip.asset?.path || ''
    const dur = clip.asset?.duration || clip.duration
    const durFrames = Math.ceil(dur * fps)
    const format = clip.type === 'audio' ? 'audio' : 'video'
    assetEntries.push(
      `        <asset id="${escapeXml(assetId)}" name="${escapeXml(clip.asset?.prompt?.slice(0, 60) || clip.importedName || 'Clip')}" src="${escapeXml(assetPath)}" start="0s" duration="${durFrames}/${fps}s" hasVideo="${format === 'video' ? '1' : '0'}" hasAudio="1" format="r1" />`,
    )
  }

  const trackGroups: Map<number, TimelineClip[]> = new Map()
  for (const clip of clips) {
    if (!trackGroups.has(clip.trackIndex)) trackGroups.set(clip.trackIndex, [])
    trackGroups.get(clip.trackIndex)!.push(clip)
  }

  const laneXml: string[] = []
  const sortedTrackIndices = [...trackGroups.keys()].sort((a, b) => a - b)
  for (const trackIdx of sortedTrackIndices) {
    const trackClips = trackGroups.get(trackIdx)!.sort((a, b) => a.startTime - b.startTime)
    const clipElements: string[] = []
    for (const clip of trackClips) {
      const assetId = clip.assetId || clip.id
      const startFrame = Math.round(clip.startTime * fps)
      const durFrames = Math.round(clip.duration * fps)
      const trimStartFrame = Math.round(clip.trimStart * fps)
      const name = clip.asset?.prompt?.slice(0, 60) || clip.importedName || 'Clip'
      let clipXml = `            <asset-clip ref="${escapeXml(assetId)}" name="${escapeXml(name)}" offset="${startFrame}/${fps}s" duration="${durFrames}/${fps}s" start="${trimStartFrame}/${fps}s"`
      if (clip.speed !== 1) clipXml += ` tcFormat="NDF"`
      clipXml += ` />`
      clipElements.push(clipXml)
    }
    const trackName = tracks[trackIdx]?.name || `Track ${trackIdx + 1}`
    laneXml.push(`          <!-- ${escapeXml(trackName)} -->\n` + clipElements.join('\n'))
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" name="FFVideoFormat${fps === 24 ? '1080p2398' : '1080p' + fps}" frameDuration="${frameDuration}" width="1920" height="1080" />
${assetEntries.join('\n')}
  </resources>
  <library>
    <event name="${escapeXml(projectName)}">
      <project name="${escapeXml(timelineName)}">
        <sequence format="r1" duration="${totalFrames}/${fps}s" tcStart="0s" tcFormat="NDF">
          <spine>
${laneXml.join('\n')}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`
}
