import { Layers } from 'lucide-react'
import { Button } from './ui/button'
import { selectSelectedClipIds } from '../views/editor/editor-selectors'
import { useEditorStore } from '../views/editor/editor-store'
import { useSaveSelectionAsTakeModal } from '../views/editor/SaveSelectionAsTakeContext'

export function SaveSelectionAsTakeToolbarButton() {
  const selectedClipIds = useEditorStore(selectSelectedClipIds)
  const { open } = useSaveSelectionAsTakeModal()
  const hasSelection = selectedClipIds.size > 0
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-6 border-zinc-700 text-zinc-400 text-[10px] px-2"
      onClick={() => open()}
      disabled={!hasSelection}
      title={hasSelection ? 'Save selection as a take variant' : 'Select clips to save as a take'}
    >
      <Layers className="h-3 w-3 mr-1" />
      Save as Take
    </Button>
  )
}
