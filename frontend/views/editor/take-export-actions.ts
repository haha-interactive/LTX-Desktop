import type { Asset, TimelineClip } from '../../types/project-model'
import { DEFAULT_COLOR_CORRECTION } from '../../types/project-model'
import {
  addAssetToEditor,
  makeId,
  updateEditorModel,
  updateSession,
  withActiveTimeline,
} from './editor-actions'
import type { EditorState } from './editor-state'

export interface ReplaceSelectionWithTakeParams {
  expandedClipIds: string[]
  asset: Asset
  insertTrackIndex: number
  audioInsertTrackIndex: number | null
  insertStartTime: number
  selectionDuration: number
}

export function replaceSelectionWithTake(
  state: EditorState,
  params: ReplaceSelectionWithTakeParams,
): EditorState {
  const {
    expandedClipIds,
    asset,
    insertTrackIndex,
    audioInsertTrackIndex,
    insertStartTime,
    selectionDuration,
  } = params

  let next = addAssetToEditor(state, asset)

  const activeIdx = asset.activeTakeIndex ?? (asset.takes && asset.takes.length > 0 ? asset.takes.length - 1 : 0)
  const videoClipId = makeId('clip')
  const audioClipId = audioInsertTrackIndex !== null ? makeId('clip-audio') : null

  // Mute video's embedded audio when we are also inserting a paired audio clip,
  // otherwise the audio plays twice.
  const videoClip: TimelineClip = {
    id: videoClipId,
    assetId: asset.id,
    type: 'video',
    startTime: insertStartTime,
    duration: selectionDuration,
    trimStart: 0,
    trimEnd: 0,
    speed: 1,
    reversed: false,
    muted: audioClipId !== null,
    volume: 1,
    trackIndex: insertTrackIndex,
    asset,
    flipH: false,
    flipV: false,
    transitionIn: { type: 'none', duration: 0 },
    transitionOut: { type: 'none', duration: 0 },
    colorCorrection: { ...DEFAULT_COLOR_CORRECTION },
    opacity: 100,
    takeIndex: activeIdx,
    ...(audioClipId !== null ? { linkedClipIds: [audioClipId] } : {}),
  }

  const audioClip: TimelineClip | null = audioClipId !== null && audioInsertTrackIndex !== null
    ? {
        id: audioClipId,
        assetId: asset.id,
        type: 'audio',
        startTime: insertStartTime,
        duration: selectionDuration,
        trimStart: 0,
        trimEnd: 0,
        speed: 1,
        reversed: false,
        muted: false,
        volume: 1,
        trackIndex: audioInsertTrackIndex,
        asset,
        flipH: false,
        flipV: false,
        transitionIn: { type: 'none', duration: 0 },
        transitionOut: { type: 'none', duration: 0 },
        colorCorrection: { ...DEFAULT_COLOR_CORRECTION },
        opacity: 100,
        takeIndex: activeIdx,
        linkedClipIds: [videoClipId],
      }
    : null

  const deleteSet = new Set(expandedClipIds)
  const inserted: TimelineClip[] = audioClip ? [videoClip, audioClip] : [videoClip]

  next = updateEditorModel(next, editorModel => withActiveTimeline(editorModel, timeline => ({
    ...timeline,
    clips: [
      ...timeline.clips
        .filter(clip => !deleteSet.has(clip.id))
        .map(clip => (
          clip.linkedClipIds && clip.linkedClipIds.some(id => deleteSet.has(id))
            ? { ...clip, linkedClipIds: clip.linkedClipIds.filter(id => !deleteSet.has(id)) }
            : clip
        )),
      ...inserted,
    ],
  })))

  return updateSession(next, session => ({
    ...session,
    selection: {
      ...session.selection,
      clipIds: new Set([videoClipId]),
    },
  }))
}
