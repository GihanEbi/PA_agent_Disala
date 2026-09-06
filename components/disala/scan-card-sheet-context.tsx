"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

import { ScanCardSheet } from "@/components/disala/scan-card-sheet"

type ScanCardSheetContextValue = {
  open: boolean
  openSheet: () => void
  closeSheet: () => void
}

const ScanCardSheetContext = createContext<ScanCardSheetContextValue | null>(null)

function ScanCardSheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <ScanCardSheetContext.Provider
      value={{
        open,
        openSheet: () => setOpen(true),
        closeSheet: () => setOpen(false),
      }}
    >
      {children}
      <ScanCardSheet open={open} onClose={() => setOpen(false)} />
    </ScanCardSheetContext.Provider>
  )
}

function useScanCardSheet() {
  const context = useContext(ScanCardSheetContext)
  if (!context) {
    throw new Error("useScanCardSheet must be used within a ScanCardSheetProvider")
  }
  return context
}

export { ScanCardSheetProvider, useScanCardSheet }
