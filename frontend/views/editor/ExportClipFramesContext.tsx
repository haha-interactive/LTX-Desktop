import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

interface ExportClipFramesModalApi {
  isOpen: boolean
  open: () => void
  close: () => void
}

const ExportClipFramesContext = createContext<ExportClipFramesModalApi | null>(null)

export function ExportClipFramesProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close])
  return (
    <ExportClipFramesContext.Provider value={value}>
      {children}
    </ExportClipFramesContext.Provider>
  )
}

export function useExportClipFramesModal(): ExportClipFramesModalApi {
  const ctx = useContext(ExportClipFramesContext)
  if (!ctx) {
    throw new Error('useExportClipFramesModal must be used within <ExportClipFramesProvider>')
  }
  return ctx
}
