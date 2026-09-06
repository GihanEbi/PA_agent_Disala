"use client"

import { useEffect, useRef, useState } from "react"
import { Keyboard, Mic, Square, Volume2, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Icon } from "@/components/disala/icon"
import { Button } from "@/components/ui/button"
import { VoiceOrb } from "@/components/disala/voice-orb"
import { VoiceStateChip } from "@/components/disala/voice-state-chip"
import { ChatComposer } from "@/components/disala/chat-composer"
import { ChatTranscript, type ChatMessage } from "@/components/disala/chat-transcript"
import { useVoiceRecorder } from "@/components/disala/use-voice-recorder"

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
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [pendingAudioUrl, setPendingAudioUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  function stopSpeaking() {
    if (audioRef.current) {
      audioRef.current.pause()
      URL.revokeObjectURL(audioRef.current.src)
      audioRef.current = null
    }
    setIsSpeaking(false)
    setPendingAudioUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  async function speakReply(text: string) {
    try {
      const response = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
      if (!response.ok) {
        console.error("Speech generation failed:", response.status)
        return
      }

      const url = URL.createObjectURL(await response.blob())
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        setIsSpeaking(false)
        URL.revokeObjectURL(url)
        if (audioRef.current === audio) audioRef.current = null
      }

      setIsSpeaking(true)
      try {
        await audio.play()
      } catch {
        // Autoplay was blocked — keep the clip ready for an explicit tap
        // instead of losing the reply.
        setIsSpeaking(false)
        setPendingAudioUrl(url)
      }
    } catch (err) {
      console.error("Speech generation error:", err)
    }
  }

  function handlePlayPendingAudio() {
    if (!pendingAudioUrl) return
    const audio = new Audio(pendingAudioUrl)
    audioRef.current = audio
    audio.onended = () => {
      setIsSpeaking(false)
      URL.revokeObjectURL(pendingAudioUrl)
      if (audioRef.current === audio) audioRef.current = null
    }
    setPendingAudioUrl(null)
    setIsSpeaking(true)
    audio.play().catch(() => setIsSpeaking(false))
  }

  async function handleSend(message: string, options?: { speak?: boolean }) {
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

      if (options?.speak) {
        void speakReply(data.assistantMessage.content)
      }
    } catch {
      setSendError("Disala couldn't respond — try again.")
    } finally {
      setIsSending(false)
    }
  }

  function handleTranscribed(text: string) {
    const trimmed = text.trim()
    if (!trimmed) {
      setVoiceNotice("I didn't catch that — try again.")
      return
    }
    setVoiceNotice(null)
    // Stay in voice mode — voice stays the primary control so the next
    // message can be spoken immediately, with the transcript shown as text
    // underneath rather than replacing the mic with a keyboard composer.
    handleSend(trimmed, { speak: true })
  }

  const recorder = useVoiceRecorder({ onTranscribed: handleTranscribed })

  function handleClose() {
    recorder.cancel()
    stopSpeaking()
    onClose()
  }

  function handleMicClick() {
    if (recorder.state === "recording") {
      recorder.stop()
    } else if (recorder.state === "idle") {
      stopSpeaking()
      setVoiceNotice(null)
      recorder.start()
    }
  }

  function handleSwitchToChat() {
    if (recorder.state !== "idle") recorder.cancel()
    stopSpeaking()
    setVoiceNotice(null)
    setMode("chat")
  }

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = "hidden"

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose()
    }
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      document.documentElement.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close Ask Disala"
        onClick={handleClose}
        className="absolute inset-0 bg-neutral-900/70"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ask Disala"
          className={cn(
            "pointer-events-auto flex w-full max-w-md flex-col items-center gap-6 rounded-t-lg border-t border-border bg-background px-6 pt-3 pb-8",
            (mode === "chat" || messages.length > 0) && "h-[85vh]"
          )}
        >
          <span className="h-1 w-9 rounded-full bg-neutral-700" />

          <div className="flex w-full items-center justify-between">
            <p className="font-display text-base font-medium text-foreground">
              Ask Disala
            </p>
            <button
              type="button"
              onClick={handleClose}
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

              {recorder.state === "recording" ? (
                <VoiceStateChip label="Listening…" />
              ) : recorder.state === "transcribing" ? (
                <VoiceStateChip label="Transcribing…" />
              ) : isSending ? (
                <VoiceStateChip label="Disala is thinking…" />
              ) : isSpeaking ? (
                <VoiceStateChip label="Speaking…" onClose={stopSpeaking} />
              ) : pendingAudioUrl ? (
                <Button variant="text" onClick={handlePlayPendingAudio}>
                  <Icon icon={Volume2} size={16} />
                  Play reply
                </Button>
              ) : voiceNotice ? (
                <p className="text-center text-sm text-neutral-300">{voiceNotice}</p>
              ) : messages.length > 0 ? (
                <ChatTranscript messages={messages} />
              ) : (
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
              )}

              {sendError ? <p className="text-sm text-red-400">{sendError}</p> : null}
              {recorder.error ? <p className="text-sm text-red-400">{recorder.error}</p> : null}

              <div className="flex items-center gap-4">
                <Button
                  variant="tertiary"
                  size="icon"
                  aria-label="Type instead"
                  className="size-12"
                  onClick={handleSwitchToChat}
                >
                  <Icon icon={Keyboard} size={20} />
                </Button>
                <Button
                  size="icon"
                  aria-label={recorder.state === "recording" ? "Stop recording" : "Start talking"}
                  className="size-16 shadow-xl shadow-gold-500/30"
                  disabled={recorder.state === "transcribing"}
                  onClick={handleMicClick}
                >
                  <Icon icon={recorder.state === "recording" ? Square : Mic} size={26} />
                </Button>
              </div>
            </>
          ) : (
            <>
              <ChatTranscript messages={messages} />
              {recorder.state === "recording" ? <VoiceStateChip label="Listening…" /> : null}
              {recorder.state === "transcribing" ? (
                <VoiceStateChip label="Transcribing…" />
              ) : null}
              {isSending ? <VoiceStateChip label="Disala is thinking…" /> : null}
              {sendError ? <p className="text-sm text-red-400">{sendError}</p> : null}
              {recorder.error ? <p className="text-sm text-red-400">{recorder.error}</p> : null}
              <div className="flex w-full items-end gap-2">
                <Button
                  variant="tertiary"
                  size="icon"
                  aria-label={recorder.state === "recording" ? "Stop recording" : "Talk instead"}
                  className="shrink-0"
                  disabled={recorder.state === "transcribing"}
                  onClick={handleMicClick}
                >
                  <Icon icon={recorder.state === "recording" ? Square : Mic} size={18} />
                </Button>
                <ChatComposer onSend={handleSend} disabled={isSending} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export { VoiceSheet }
