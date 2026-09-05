"use client"

import { useEffect, useState } from "react"
import { Keyboard, Mic, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Icon } from "@/components/disala/icon"
import { Button } from "@/components/ui/button"
import { VoiceOrb } from "@/components/disala/voice-orb"
import { VoiceStateChip } from "@/components/disala/voice-state-chip"
import { ChatComposer } from "@/components/disala/chat-composer"
import { ChatTranscript, type ChatMessage } from "@/components/disala/chat-transcript"

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
  // Deliberately not reset on close/reopen within the same page load — the
  // parent (VoiceSheetProvider) never unmounts this component, it only
  // stops rendering it (see the early `if (!open) return null` below), so
  // this state survives exactly like a real chat's should.
  const [mode, setMode] = useState<"voice" | "chat">("voice")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isSending, setIsSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

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

  async function handleSend(message: string) {
    setMessages((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, role: "user", content: message },
    ])
    setIsSending(true)
    setSendError(null)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      })
      const data = await response.json()

      if (!response.ok) {
        setSendError(data.error ?? "Disala couldn't respond — try again.")
        return
      }

      setMessages((prev) => [
        ...prev,
        {
          id: data.assistantMessage.id,
          role: "assistant",
          content: data.assistantMessage.content,
          approvals: data.approvals,
        },
      ])
    } catch {
      setSendError("Disala couldn't respond — try again.")
    } finally {
      setIsSending(false)
    }
  }

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
            "pointer-events-auto flex w-full max-w-md flex-col items-center gap-6 rounded-t-lg border-t border-border bg-background px-6 pt-3 pb-8",
            mode === "chat" && "h-[85vh]"
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

          {mode === "voice" ? (
            <>
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
                  onClick={() => setMode("chat")}
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
            </>
          ) : (
            <>
              <ChatTranscript messages={messages} />
              {isSending ? <VoiceStateChip label="Disala is thinking…" /> : null}
              {sendError ? <p className="text-sm text-red-400">{sendError}</p> : null}
              <ChatComposer onSend={handleSend} disabled={isSending} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export { VoiceSheet }
