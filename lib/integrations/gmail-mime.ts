import "server-only"

function base64UrlDecode(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/")
  return Buffer.from(normalized, "base64").toString("utf-8")
}

function base64UrlEncode(data: string): string {
  return Buffer.from(data, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

type MessagePart = {
  mimeType?: string | null
  body?: { data?: string | null } | null
  parts?: MessagePart[] | null
}

/**
 * Walks a Gmail message's MIME tree and extracts readable body text —
 * prefers text/plain, falls back to a stripped text/html part. Gmail
 * returns each part's body as base64url, never plain text.
 */
function parseMessagePayload(payload: MessagePart | null | undefined): string {
  if (!payload) return ""

  const flat: MessagePart[] = []
  const collect = (part: MessagePart) => {
    flat.push(part)
    part.parts?.forEach(collect)
  }
  collect(payload)

  const plain = flat.find((part) => part.mimeType === "text/plain" && part.body?.data)
  if (plain?.body?.data) return base64UrlDecode(plain.body.data).trim()

  const html = flat.find((part) => part.mimeType === "text/html" && part.body?.data)
  if (html?.body?.data) return stripHtml(base64UrlDecode(html.body.data))

  return ""
}

function headerLine(name: string, value: string): string {
  return `${name}: ${value}`
}

/**
 * Builds a real base64url-encoded RFC 2822 message — exactly the shape
 * Gmail's `users.drafts.create`/`users.messages.send` expect as `raw`. This
 * phase never calls either (see disala-06's decision #1), but the encoding
 * itself is genuine, reusable logic Phase 4 needs verbatim.
 *
 * `inReplyToMessageId`, when given, must be the RFC 2822 `Message-ID`
 * header value of the original message (e.g. `getEmail`'s `messageIdHeader`
 * field) — NOT the Gmail API's own opaque message `id`. Those are different
 * identifiers; passing the wrong one silently breaks email-client threading.
 */
function buildRawMimeMessage(input: {
  to: string[]
  cc?: string[]
  subject: string
  bodyText: string
  inReplyToMessageId?: string
}): string {
  const headers = [
    headerLine("To", input.to.join(", ")),
    ...(input.cc?.length ? [headerLine("Cc", input.cc.join(", "))] : []),
    headerLine("Subject", input.subject),
    headerLine("MIME-Version", "1.0"),
    headerLine("Content-Type", 'text/plain; charset="UTF-8"'),
    headerLine("Content-Transfer-Encoding", "7bit"),
    ...(input.inReplyToMessageId
      ? [
          headerLine("In-Reply-To", input.inReplyToMessageId),
          headerLine("References", input.inReplyToMessageId),
        ]
      : []),
  ]

  const message = `${headers.join("\r\n")}\r\n\r\n${input.bodyText}`
  return base64UrlEncode(message)
}

export { parseMessagePayload, buildRawMimeMessage, base64UrlDecode, base64UrlEncode }
