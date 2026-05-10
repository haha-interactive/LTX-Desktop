import { Camera } from 'lucide-react'
import { Button } from './ui/button'
import { useEditorStore } from '../views/editor/editor-store'
import { useExportClipFramesModal } from '../views/editor/ExportClipFramesContext'
import { selectClipFrameExportTarget } from '../views/editor/useClipFrameExport'

export function ExportClipFramesToolbarButton() {
  const target = useEditorStore(selectClipFrameExportTarget)
  const { open } = useExportClipFramesModal()
  const enabled = !!target && target.isVideo && !!target.videoPath
  const title = !target
    ? 'Select a single video clip to export its frames'
    : !target.isVideo
      ? 'Select a video clip (audio/image clips not supported)'
      : 'Export start/end frames of the selected clip'
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-6 border-zinc-700 text-zinc-400 text-[10px] px-2"
      onClick={() => open()}
      disabled={!enabled}
      title={title}
    >
      <Camera className="h-3 w-3 mr-1" />
      Export Frames
    </Button>
  )
}
