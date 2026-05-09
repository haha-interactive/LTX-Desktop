import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

interface SaveSelectionAsTakeModalApi {
  isOpen: boolean
  open: () => void
  close: () => void
}

const SaveSelectionAsTakeContext = createContext<SaveSelectionAsTakeModalApi | null>(null)

export function SaveSelectionAsTakeProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close])
  return (
    <SaveSelectionAsTakeContext.Provider value={value}>
      {children}
    </SaveSelectionAsTakeContext.Provider>
  )
}

export function useSaveSelectionAsTakeModal(): SaveSelectionAsTakeModalApi {
  const ctx = useContext(SaveSelectionAsTakeContext)
  if (!ctx) {
    throw new Error('useSaveSelectionAsTakeModal must be used within <SaveSelectionAsTakeProvider>')
  }
  return ctx
}
