"use client"

import { useCallback, useRef, useState } from "react"

const MAX_RECORDING_MS = 120_000
const CANDIDATE_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"]

type RecorderState = "idle" | "recording" | "transcribing"

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null
}

function fileExtensionFor(mimeType: string) {
  if (mimeType.includes("mp4")) return "mp4"
  if (mimeType.includes("aac")) return "aac"
  return "webm"
}

/**
 * Records one clip, uploads it once to /api/transcribe on stop, and reports
 * the transcribed text via `onTranscribed` — including an empty string for
 * a clip with no detected speech, which the caller decides how to handle.
 * Every exit path (success, error, or `cancel()`) releases the microphone.
 */
function useVoiceRecorder({ onTranscribed }: { onTranscribed: (text: string) => void }) {
  const [state, setState] = useState<RecorderState>("idle")
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const discardRef = useRef(false)

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const start = useCallback(async () => {
    setError(null)

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Voice input isn't supported in this browser.")
      return
    }
    const mimeType = pickMimeType()
    if (!mimeType) {
      setError("Voice input isn't supported in this browser.")
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError("Microphone permission was denied — check your browser settings.")
      return
    }

    streamRef.current = stream
    chunksRef.current = []
    discardRef.current = false

    const recorder = new MediaRecorder(stream, { mimeType })
    mediaRecorderRef.current = recorder

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }

    recorder.onstop = async () => {
      releaseStream()

      if (discardRef.current) {
        setState("idle")
        return
      }

      const blob = new Blob(chunksRef.current, { type: mimeType })
      chunksRef.current = []
      setState("transcribing")

      try {
        const formData = new FormData()
        formData.append("audio", blob, `recording.${fileExtensionFor(mimeType)}`)

        const response = await fetch("/api/transcribe", { method: "POST", body: formData })
        const data = await response.json()

        if (!response.ok) {
          setError(data.error ?? "Couldn't transcribe that — try again.")
          setState("idle")
          return
        }

        setState("idle")
        onTranscribed(typeof data.text === "string" ? data.text : "")
      } catch {
        setError("Couldn't transcribe that — try again.")
        setState("idle")
      }
    }

    recorder.start()
    setState("recording")

    timeoutRef.current = setTimeout(() => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop()
      }
    }, MAX_RECORDING_MS)
  }, [onTranscribed, releaseStream])

  const stop = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop()
    }
  }, [])

  const cancel = useCallback(() => {
    discardRef.current = true
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop()
    } else {
      releaseStream()
      setState("idle")
    }
  }, [releaseStream])

  return { state, error, start, stop, cancel }
}

export { useVoiceRecorder }
