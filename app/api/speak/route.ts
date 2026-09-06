import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { z } from "zod"
import { generateSpeech } from "ai"
import { openai } from "@ai-sdk/openai"

const TTS_MODEL_ID = "tts-1"
const TTS_VOICE = "alloy"

const speakRequestSchema = z.object({ text: z.string().min(1).max(4000) })

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = speakRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  try {
    const result = await generateSpeech({
      model: openai.speech(TTS_MODEL_ID),
      text: parsed.data.text,
      voice: TTS_VOICE,
      outputFormat: "mp3",
    })

    return new NextResponse(Buffer.from(result.audio.uint8Array), {
      headers: { "Content-Type": result.audio.mediaType || "audio/mpeg" },
    })
  } catch (err) {
    console.error("Speech generation error:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "Couldn't generate speech." }, { status: 502 })
  }
}
