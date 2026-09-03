"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

import { VoiceSheet } from "@/components/disala/voice-sheet"

type VoiceSheetContextValue = {
  open: boolean
  openSheet: () => void
  closeSheet: () => void
}

const VoiceSheetContext = createContext<VoiceSheetContextValue | null>(null)

function VoiceSheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <VoiceSheetContext.Provider
      value={{
        open,
        openSheet: () => setOpen(true),
        closeSheet: () => setOpen(false),
      }}
    >
      {children}
      <VoiceSheet open={open} onClose={() => setOpen(false)} />
    </VoiceSheetContext.Provider>
  )
}

function useVoiceSheet() {
  const context = useContext(VoiceSheetContext)
  if (!context) {
    throw new Error("useVoiceSheet must be used within a VoiceSheetProvider")
  }
  return context
}

export { VoiceSheetProvider, useVoiceSheet }
