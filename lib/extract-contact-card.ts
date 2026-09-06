import "server-only"
import { z } from "zod"
import { generateObject } from "ai"
import { openai } from "@ai-sdk/openai"

// gpt-4o, not the chat route's gpt-5.6-terra — long-established, well
// documented multimodal/vision support. One line to change if a live test
// says a different model does better on real business cards.
const CARD_VISION_MODEL_ID = "gpt-4o"

// OpenAI's Structured Outputs (strict JSON schema mode) rejects a schema
// where "required" omits any property — every key must be required, with
// "not present" expressed as null instead of an absent key. `.nullable()`,
// not `.optional()`, is what keeps every field in `required`.
const extractedContactSchema = z.object({
  name: z.string().nullable(),
  company: z.string().nullable(),
  title: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  address: z.string().nullable(),
})

// The rest of the app deals in plain optional fields — the nullable/strict
// shape above is purely an OpenAI schema requirement, normalized away here
// so nothing downstream needs to know about it.
type ExtractedContact = {
  name?: string
  company?: string
  title?: string
  email?: string
  phone?: string
  website?: string
  address?: string
}

type ExtractResult =
  | { ok: true; data: ExtractedContact }
  | { ok: false; error: string }

/**
 * Reads a business card photo and returns whatever structured fields it can
 * find — every field is optional, since a partially-legible card is normal
 * and the caller shows the result in an editable review form, never as a
 * finished fact. Never persists the image; it exists only for this call.
 */
async function extractContactFromImage(
  imageBytes: Uint8Array,
  mediaType: string
): Promise<ExtractResult> {
  try {
    const result = await generateObject({
      model: openai.chat(CARD_VISION_MODEL_ID),
      schema: extractedContactSchema,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the contact details from this business card photo. Use null for anything that isn't present or legible — never guess or invent a value.",
            },
            { type: "file", data: imageBytes, mediaType },
          ],
        },
      ],
    })

    const raw = result.object
    return {
      ok: true,
      data: {
        name: raw.name ?? undefined,
        company: raw.company ?? undefined,
        title: raw.title ?? undefined,
        email: raw.email ?? undefined,
        phone: raw.phone ?? undefined,
        website: raw.website ?? undefined,
        address: raw.address ?? undefined,
      },
    }
  } catch (err) {
    console.error("Business card extraction error:", err instanceof Error ? err.message : err)
    return { ok: false, error: "Couldn't read that card — try again." }
  }
}

export { extractContactFromImage }
