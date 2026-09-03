"use client"

import { Plus } from "lucide-react"

import { cn } from "@/lib/utils"
import { Icon } from "@/components/disala/icon"
import { useVoiceSheet } from "@/components/disala/voice-sheet-context"

function CaptureNoteButton({ className }: { className?: string }) {
  const { openSheet } = useVoiceSheet()

  return (
    <button
      type="button"
      onClick={openSheet}
      className={cn(
        "flex items-center gap-2 rounded-full border border-dashed border-neutral-700 px-5 py-3 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:text-foreground",
        className
      )}
    >
      <Icon icon={Plus} size={18} className="text-gold-400" />
      Capture a new note by voice
    </button>
  )
}

export { CaptureNoteButton }
