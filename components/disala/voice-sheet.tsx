"use client"

import { useEffect } from "react"
import { Keyboard, Mic, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Icon } from "@/components/disala/icon"
import { Button } from "@/components/ui/button"
import { VoiceOrb } from "@/components/disala/voice-orb"

const SUGGESTIONS = [
  "Give me my morning brief",
  "What's on my calendar",
  "Any emails need a reply",
  "Read back my notes",
]

function VoiceSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  useEffect(() => {
    if (!open) return

    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = "hidden"

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      document.documentElement.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close Ask Disala"
        onClick={onClose}
        className="absolute inset-0 bg-neutral-900/70"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ask Disala"
          className={cn(
            "pointer-events-auto flex w-full max-w-md flex-col items-center gap-6 rounded-t-lg border-t border-border bg-background px-6 pt-3 pb-8"
          )}
        >
          <span className="h-1 w-9 rounded-full bg-neutral-700" />

          <div className="flex w-full items-center justify-between">
            <p className="font-display text-base font-medium text-foreground">
              Ask Disala
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-neutral-300 transition-colors hover:text-foreground"
            >
              <Icon icon={X} size={20} />
            </button>
          </div>

          <VoiceOrb size={110} />

          <p className="text-center font-display text-2xl leading-[29px] font-medium text-foreground">
            What can I help with?
          </p>

          <div className="grid w-full grid-cols-2 gap-3">
            {SUGGESTIONS.map((suggestion) => (
              <span
                key={suggestion}
                className="rounded-full bg-card px-4 py-3 text-center text-sm font-medium text-foreground"
              >
                {suggestion}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="tertiary"
              size="icon"
              aria-label="Type instead"
              className="size-12"
            >
              <Icon icon={Keyboard} size={20} />
            </Button>
            <Button
              size="icon"
              aria-label="Start talking"
              className="size-16 shadow-xl shadow-gold-500/30"
            >
              <Icon icon={Mic} size={26} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export { VoiceSheet }
