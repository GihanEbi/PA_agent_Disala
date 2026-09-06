import "server-only"
import { z } from "zod"
import { generateObject } from "ai"
import { openai } from "@ai-sdk/openai"

// gpt-4o, not the chat route's gpt-5.6-terra — long-established, well
// documented multimodal/vision support. One line to change if a live test
// says a different model does better on real business cards.
const CARD_VISION_MODEL_ID = "gpt-4o"

const extractedContactSchema = z.object({
  name: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  address: z.string().optional(),
})

type ExtractedContact = z.infer<typeof extractedContactSchema>

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
              text: "Extract the contact details from this business card photo. Leave a field out entirely if it isn't present or legible — never guess or invent a value.",
            },
            { type: "file", data: imageBytes, mediaType },
          ],
        },
      ],
    })

    return { ok: true, data: result.object }
  } catch (err) {
    console.error("Business card extraction error:", err instanceof Error ? err.message : err)
    return { ok: false, error: "Couldn't read that card — try again." }
  }
}

export { extractContactFromImage }
