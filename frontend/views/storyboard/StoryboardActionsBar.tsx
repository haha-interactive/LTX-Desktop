import { useCallback, useState } from 'react'
import { Download, Film, Loader2, AlertCircle, Check } from 'lucide-react'
import type { Project } from '../../types/project-model'
import type { StoryboardItem } from '../../lib/storyboard-storage'
import { Button } from '../../components/ui/button'
import { useProjects } from '../../contexts/ProjectContext'
import {
  buildFcpxmlFromStoryboard,
  computeTotalDuration,
  materializeStoryboardTimeline,
  nextStoryboardTimelineName,
} from './storyboard-utils'

interface StoryboardActionsBarProps {
  project: Project
  items: StoryboardItem[]
}

type ToastKind = 'info' | 'success' | 'error' | null

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  const total = Math.max(0, seconds)
  const mm = Math.floor(total / 60)
  const ss = total - mm * 60
  return `${mm}:${ss.toFixed(2).padStart(5, '0')}`
}

export function StoryboardActionsBar({ project, items }: StoryboardActionsBarProps) {
  const { setProject } = useProjects()
  const [toast, setToast] = useState<{ kind: ToastKind; text: string } | null>(null)
  const [working, setWorking] = useState<'export' | 'create' | null>(null)

  const totalDuration = computeTotalDuration(items, project)

  const showToast = useCallback((kind: ToastKind, text: string) => {
    setToast({ kind, text })
    setTimeout(() => setToast(null), 4000)
  }, [])

  const handleAddTimeline = useCallback(() => {
    if (items.length === 0) {
      showToast('info', 'Storyboard is empty')
      return
    }
    setWorking('create')
    const result = materializeStoryboardTimeline(items, project)
    if (!result) {
      setWorking(null)
      showToast('error', 'No usable image/video items in the storyboard')
      return
    }
    const next: Project = {
      ...project,
      timelines: [...project.timelines, result.timeline],
      activeTimelineId: result.timeline.id,
      updatedAt: Date.now(),
    }
    setProject(project.id, next)
    setWorking(null)
    showToast('success', `Created "${result.timeline.name}"`)
  }, [items, project, setProject, showToast])

  const handleExportXml = useCallback(async () => {
    if (items.length === 0) {
      showToast('info', 'Storyboard is empty')
      return
    }
    const api = window.electronAPI
    if (!api) {
      showToast('error', 'Electron bridge not available')
      return
    }
    setWorking('export')
    const timelineName = nextStoryboardTimelineName(project.timelines)
    const xml = buildFcpxmlFromStoryboard(items, project, project.name, timelineName)
    if (!xml) {
      setWorking(null)
      showToast('error', 'No usable image/video items in the storyboard')
      return
    }
    const filePath = await api.showSaveDialog({
      title: 'Export Storyboard XML',
      defaultPath: `${project.name}_${timelineName}.fcpxml`,
      filters: [
        { name: 'Final Cut Pro XML', extensions: ['fcpxml'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (!filePath) {
      setWorking(null)
      return
    }
    const saved = await api.saveFile({ filePath, data: xml })
    setWorking(null)
    if (saved && saved.success) {
      showToast('success', `Saved ${filePath.split(/[\\/]/).pop()}`)
    } else {
      showToast('error', `Save failed: ${saved && !saved.success ? saved.error : 'unknown'}`)
    }
  }, [items, project, showToast])

  return (
    <div className="border-t border-zinc-800 bg-zinc-950/40 px-4 py-3 flex items-center gap-3 flex-shrink-0">
      <div className="text-xs text-zinc-400">
        Total duration: <span className="text-white font-medium tabular-nums">{formatDuration(totalDuration)}</span>
      </div>
      <div className="flex-1" />
      {toast && (
        <div className={`flex items-center gap-1.5 text-[11px] ${
          toast.kind === 'success' ? 'text-green-400'
          : toast.kind === 'error' ? 'text-red-400'
          : 'text-zinc-400'
        }`}>
          {toast.kind === 'success' && <Check className="h-3.5 w-3.5" />}
          {toast.kind === 'error' && <AlertCircle className="h-3.5 w-3.5" />}
          <span className="max-w-[280px] truncate">{toast.text}</span>
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        className="border-zinc-700 text-zinc-300"
        onClick={handleExportXml}
        disabled={working !== null || items.length === 0}
      >
        {working === 'export' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
        Export Timeline XML
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="border-blue-500/60 text-blue-300 bg-blue-500/10 hover:bg-blue-500/20"
        onClick={handleAddTimeline}
        disabled={working !== null || items.length === 0}
      >
        {working === 'create' ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Film className="h-3.5 w-3.5 mr-1.5" />}
        Add New Timeline
      </Button>
    </div>
  )
}
