import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { transcribe } from "ai"
import { openai } from "@ai-sdk/openai"

const MAX_AUDIO_BYTES = 25 * 1024 * 1024
const TRANSCRIPTION_MODEL_ID = "whisper-1"

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }

  const formData = await req.formData().catch(() => null)
  const audio = formData?.get("audio")
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "Missing audio" }, { status: 400 })
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Recording is too large" }, { status: 400 })
  }

  try {
    const result = await transcribe({
      model: openai.transcription(TRANSCRIPTION_MODEL_ID),
      audio: new Uint8Array(await audio.arrayBuffer()),
    })
    return NextResponse.json({ text: result.text.trim() })
  } catch (err) {
    console.error("Transcription error:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Couldn't transcribe that — try again." }, { status: 502 })
  }
}
