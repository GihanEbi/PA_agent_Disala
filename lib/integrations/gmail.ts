import "server-only"
import { z } from "zod"

import {
  getAuthorizedGoogleClients,
  runGoogleApiCall,
  hasUsableGoogleConnection,
  type GoogleApiResult,
} from "@/lib/integrations/google-client"
import { parseMessagePayload, buildRawMimeMessage } from "@/lib/integrations/gmail-mime"

const MAX_RESULTS_CAP = 50

function invalidInput<T>(issueMessage: string | undefined): GoogleApiResult<T> {
  return { ok: false, error: { code: "INVALID_INPUT", message: issueMessage ?? "Invalid input" } }
}

function toGmailDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10).replace(/-/g, "/")
}

function buildGmailQuery(input: {
  query?: string
  unreadOnly?: boolean
  importantOnly?: boolean
  after?: string
  before?: string
}): string {
  const parts: string[] = []
  if (input.query) parts.push(input.query)
  if (input.unreadOnly) parts.push("is:unread")
  if (input.importantOnly) parts.push("is:important")
  if (input.after) parts.push(`after:${toGmailDate(input.after)}`)
  if (input.before) parts.push(`before:${toGmailDate(input.before)}`)
  return parts.join(" ")
}

function getHeader(headers: { name?: string | null; value?: string | null }[], name: string) {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ""
}

const isoDate = z.string().refine((s) => !isNaN(Date.parse(s)), "must be a valid date")

// --- searchEmails ---

const searchEmailsSchema = z.object({
  query: z.string().max(500).optional(),
  unreadOnly: z.boolean().optional(),
  importantOnly: z.boolean().optional(),
  after: isoDate.optional(),
  before: isoDate.optional(),
  maxResults: z.number().int().positive().max(MAX_RESULTS_CAP).optional(),
})

type EmailSummary = {
  id: string
  threadId: string
  from: string
  subject: string
  date: string
  snippet: string
  isUnread: boolean
  isImportant: boolean
}

async function searchEmails(userId: string, input: unknown): Promise<GoogleApiResult<EmailSummary[]>> {
  const parsed = searchEmailsSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)

  const clients = await getAuthorizedGoogleClients(userId)
  if (!clients.ok) return clients
  const { gmail } = clients.data

  const listResult = await runGoogleApiCall(userId, () =>
    gmail.users.messages.list({
      userId: "me",
      q: buildGmailQuery(parsed.data),
      maxResults: parsed.data.maxResults ?? 10,
    })
  )
  if (!listResult.ok) return listResult

  const refs = listResult.data.messages ?? []

  const summaries = await Promise.all(
    refs.map(async (ref): Promise<EmailSummary | null> => {
      if (!ref.id) return null
      const result = await runGoogleApiCall(userId, () =>
        gmail.users.messages.get({
          userId: "me",
          id: ref.id!,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        })
      )
      if (!result.ok) return null

      const message = result.data
      const headers = message.payload?.headers ?? []
      const labelIds = message.labelIds ?? []

      return {
        id: message.id ?? "",
        threadId: message.threadId ?? "",
        from: getHeader(headers, "From"),
        subject: getHeader(headers, "Subject"),
        date: getHeader(headers, "Date"),
        snippet: message.snippet ?? "",
        isUnread: labelIds.includes("UNREAD"),
        isImportant: labelIds.includes("IMPORTANT"),
      }
    })
  )

  return { ok: true, data: summaries.filter((s): s is EmailSummary => s !== null) }
}

// --- getEmail ---

const getEmailSchema = z.object({
  messageId: z.string().min(1).max(200),
})

type EmailDetail = {
  id: string
  threadId: string
  from: string
  to: string
  cc: string
  subject: string
  date: string
  messageIdHeader: string
  bodyText: string
  isUnread: boolean
  isImportant: boolean
  labelIds: string[]
}

async function getEmail(userId: string, input: unknown): Promise<GoogleApiResult<EmailDetail>> {
  const parsed = getEmailSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)

  const clients = await getAuthorizedGoogleClients(userId)
  if (!clients.ok) return clients

  const result = await runGoogleApiCall(userId, () =>
    clients.data.gmail.users.messages.get({
      userId: "me",
      id: parsed.data.messageId,
      format: "full",
    })
  )
  if (!result.ok) return result

  const message = result.data
  const headers = message.payload?.headers ?? []
  const labelIds = message.labelIds ?? []

  return {
    ok: true,
    data: {
      id: message.id ?? "",
      threadId: message.threadId ?? "",
      from: getHeader(headers, "From"),
      to: getHeader(headers, "To"),
      cc: getHeader(headers, "Cc"),
      subject: getHeader(headers, "Subject"),
      date: getHeader(headers, "Date"),
      messageIdHeader: getHeader(headers, "Message-ID"),
      bodyText: parseMessagePayload(message.payload),
      isUnread: labelIds.includes("UNREAD"),
      isImportant: labelIds.includes("IMPORTANT"),
      labelIds,
    },
  }
}

// --- createDraft (no Gmail API call — see disala-06 decision #1) ---

const createDraftSchema = z.object({
  to: z.array(z.string().email()).min(1).max(20),
  cc: z.array(z.string().email()).max(20).optional(),
  subject: z.string().min(1).max(500),
  bodyText: z.string().min(1).max(20000),
  inReplyToMessageId: z.string().min(1).max(500).optional(),
  threadId: z.string().min(1).max(200).optional(),
})

type DraftPayload = {
  to: string[]
  cc: string[]
  subject: string
  bodyText: string
  threadId?: string
  raw: string
}

async function createDraft(userId: string, input: unknown): Promise<GoogleApiResult<DraftPayload>> {
  const parsed = createDraftSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)

  if (!(await hasUsableGoogleConnection(userId))) {
    return { ok: false, error: { code: "NOT_CONNECTED", message: "No Google account connected" } }
  }

  const raw = buildRawMimeMessage({
    to: parsed.data.to,
    cc: parsed.data.cc,
    subject: parsed.data.subject,
    bodyText: parsed.data.bodyText,
    inReplyToMessageId: parsed.data.inReplyToMessageId,
  })

  return {
    ok: true,
    data: {
      to: parsed.data.to,
      cc: parsed.data.cc ?? [],
      subject: parsed.data.subject,
      bodyText: parsed.data.bodyText,
      threadId: parsed.data.threadId,
      raw,
    },
  }
}

// --- sendEmail (the first real Gmail write in this project — only ever
// called from lib/approvals.ts's post-approval execution step, never from
// an agent tool or route directly; see disala-07 decision #8/security) ---

const sendEmailSchema = z.object({
  // `raw` was already fully validated when createDraft built it — re-parsing
  // the MIME string to re-derive to/subject/body would be pure ceremony.
  raw: z.string().min(1),
  threadId: z.string().min(1).max(200).optional(),
})

type SentEmail = {
  id: string
  threadId: string
}

async function sendEmail(userId: string, input: unknown): Promise<GoogleApiResult<SentEmail>> {
  const parsed = sendEmailSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)

  const clients = await getAuthorizedGoogleClients(userId)
  if (!clients.ok) return clients

  const result = await runGoogleApiCall(userId, () =>
    clients.data.gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: parsed.data.raw, threadId: parsed.data.threadId },
    })
  )
  if (!result.ok) return result

  return {
    ok: true,
    data: { id: result.data.id ?? "", threadId: result.data.threadId ?? "" },
  }
}

export { searchEmails, getEmail, createDraft, sendEmail }
