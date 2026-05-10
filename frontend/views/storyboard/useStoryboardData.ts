import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Project } from '../../types/project-model'
import {
  emptyStoryboardDocument,
  readStoryboard,
  writeStoryboard,
  type StoryboardItem,
} from '../../lib/storyboard-storage'
import { makeId } from '../editor/editor-actions'

export type SortMode = 'insertion' | 'name-asc' | 'name-desc'

interface UseStoryboardDataParams {
  projectId: string
  project: Project | null
}

function makeItemId(): string {
  return makeId('sb-item')
}

function sortByName(items: StoryboardItem[], project: Project | null, dir: 'asc' | 'desc'): StoryboardItem[] {
  if (!project) return items
  const keyOf = (item: StoryboardItem): string => {
    const asset = project.assets.find(a => a.id === item.assetId)
    return ((asset?.prompt && asset.prompt.trim())
      || asset?.path.split(/[\\/]/).pop()
      || '').toLowerCase()
  }
  return [...items].sort((a, b) => {
    const ka = keyOf(a)
    const kb = keyOf(b)
    if (ka < kb) return dir === 'asc' ? -1 : 1
    if (ka > kb) return dir === 'asc' ? 1 : -1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
}

export function useStoryboardData({ projectId, project }: UseStoryboardDataParams) {
  const [items, setItemsState] = useState<StoryboardItem[]>([])
  const [sortMode, setSortMode] = useState<SortMode>('insertion')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const doc = readStoryboard(projectId)
    setItemsState(doc.items)
    setSortMode('insertion')
    setHydrated(true)
  }, [projectId])

  const persist = useCallback((nextItems: StoryboardItem[]) => {
    setItemsState(nextItems)
    writeStoryboard(projectId, { version: 1, items: nextItems })
  }, [projectId])

  const addItems = useCallback((assetIds: string[]) => {
    const newItems: StoryboardItem[] = assetIds.map(assetId => ({
      id: makeItemId(),
      assetId,
    }))
    persist([...items, ...newItems])
  }, [items, persist])

  const removeItem = useCallback((itemId: string) => {
    persist(items.filter(i => i.id !== itemId))
  }, [items, persist])

  const moveItem = useCallback((sourceId: string, targetId: string | null) => {
    const filtered = items.filter(i => i.id !== sourceId)
    const source = items.find(i => i.id === sourceId)
    if (!source) return
    if (targetId === null) {
      persist([...filtered, source])
      return
    }
    const targetIdx = filtered.findIndex(i => i.id === targetId)
    if (targetIdx === -1) {
      persist([...filtered, source])
      return
    }
    const next = [...filtered.slice(0, targetIdx), source, ...filtered.slice(targetIdx)]
    persist(next)
  }, [items, persist])

  const setItemTakeIndex = useCallback((itemId: string, takeIndex: number | undefined) => {
    persist(items.map(i => (
      i.id === itemId
        ? (takeIndex === undefined ? { id: i.id, assetId: i.assetId } : { ...i, takeIndex })
        : i
    )))
  }, [items, persist])

  const sortItemsByName = useCallback((dir: 'asc' | 'desc') => {
    const sorted = sortByName(items, project, dir)
    persist(sorted)
    setSortMode(dir === 'asc' ? 'name-asc' : 'name-desc')
  }, [items, persist, project])

  const cycleSortMode = useCallback(() => {
    if (sortMode === 'insertion') {
      sortItemsByName('asc')
    } else if (sortMode === 'name-asc') {
      sortItemsByName('desc')
    } else {
      setSortMode('insertion')
    }
  }, [sortMode, sortItemsByName])

  const replaceItems = useCallback((nextItems: StoryboardItem[]) => {
    persist(nextItems)
    setSortMode('insertion')
  }, [persist])

  const renderableItems = useMemo<StoryboardItem[]>(() => {
    if (!project) return items
    const knownIds = new Set(project.assets.map(a => a.id))
    return items.filter(i => knownIds.has(i.assetId))
  }, [items, project])

  useEffect(() => {
    if (!hydrated || !project) return
    if (renderableItems.length !== items.length) {
      writeStoryboard(projectId, { version: 1, items: renderableItems })
      setItemsState(renderableItems)
    }
  }, [hydrated, items.length, project, projectId, renderableItems])

  return {
    items: renderableItems,
    sortMode,
    addItems,
    removeItem,
    moveItem,
    setItemTakeIndex,
    cycleSortMode,
    replaceItems,
    hydrated,
  }
}

export function defaultStoryboard(): ReturnType<typeof emptyStoryboardDocument> {
  return emptyStoryboardDocument()
}
