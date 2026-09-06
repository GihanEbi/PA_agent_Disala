import "server-only"
import { z } from "zod"

import { db } from "@/lib/db"
import { WhatsAppConnectionStatus } from "@/lib/generated/prisma/enums"

/**
 * The agent/UI-facing read surface — Postgres-only, never imports Baileys or
 * client.ts. Mirrors the Gmail/Calendar GoogleApiResult envelope
 * (lib/integrations/google-client.ts) so the tool layer treats every
 * integration's results uniformly, even though WhatsApp has a different
 * failure taxonomy (no OAuth token to expire, no provider quota).
 */

type WhatsAppErrorCode = "NOT_CONNECTED" | "NO_SYNCED_CHATS" | "INVALID_INPUT"

type WhatsAppResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: WhatsAppErrorCode; message: string } }

type WhatsAppMessageView = {
  chatJid: string
  chatName: string | null
  senderName: string | null
  text: string
  sentAt: string
  isFromMe: boolean
}

function failure(code: WhatsAppErrorCode, message: string): WhatsAppResult<never> {
  return { ok: false, error: { code, message } }
}

async function requireConnectedWithSyncedChats(userId: string): Promise<WhatsAppResult<true>> {
  const connection = await db.whatsAppConnection.findUnique({ where: { userId } })
  if (!connection || connection.status !== WhatsAppConnectionStatus.CONNECTED) {
    return failure("NOT_CONNECTED", "WhatsApp isn't connected.")
  }
  const anySynced = await db.whatsAppSyncedChat.findFirst({ where: { userId, syncing: true } })
  if (!anySynced) {
    return failure(
      "NO_SYNCED_CHATS",
      "WhatsApp is connected, but no chats have been chosen to sync yet."
    )
  }
  return { ok: true, data: true }
}

async function chatNameLookup(userId: string, chatJids: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(chatJids)]
  if (unique.length === 0) return new Map()
  const chats = await db.whatsAppSyncedChat.findMany({ where: { userId, chatJid: { in: unique } } })
  return new Map(chats.map((c) => [c.chatJid, c.chatName]))
}

const searchMessagesInput = z.object({
  chatJid: z.string().optional(),
  query: z.string().optional(),
  after: z.string().datetime().optional(),
  before: z.string().datetime().optional(),
  maxResults: z.number().int().positive().max(50).optional(),
})

async function searchMessages(
  userId: string,
  input: unknown
): Promise<WhatsAppResult<WhatsAppMessageView[]>> {
  const parsed = searchMessagesInput.safeParse(input)
  if (!parsed.success) {
    return failure("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input")
  }
  const gate = await requireConnectedWithSyncedChats(userId)
  if (!gate.ok) return gate

  const { chatJid, query, after, before, maxResults } = parsed.data
  const messages = await db.whatsAppMessage.findMany({
    where: {
      userId,
      ...(chatJid ? { chatJid } : {}),
      ...(query ? { text: { contains: query, mode: "insensitive" as const } } : {}),
      ...(after || before
        ? {
            sentAt: {
              ...(after ? { gte: new Date(after) } : {}),
              ...(before ? { lte: new Date(before) } : {}),
            },
          }
        : {}),
    },
    orderBy: { sentAt: "desc" },
    take: maxResults ?? 10,
  })

  const chatNames = await chatNameLookup(
    userId,
    messages.map((m) => m.chatJid)
  )

  return {
    ok: true,
    data: messages.map((m) => ({
      chatJid: m.chatJid,
      chatName: chatNames.get(m.chatJid) ?? null,
      senderName: m.senderName,
      text: m.text,
      sentAt: m.sentAt.toISOString(),
      isFromMe: m.isFromMe,
    })),
  }
}

const getRecentMessagesInput = z.object({
  chatJid: z.string().min(1),
  sinceHours: z
    .number()
    .int()
    .positive()
    .max(24 * 30)
    .optional(),
  limit: z.number().int().positive().max(100).optional(),
})

async function getRecentMessages(
  userId: string,
  input: unknown
): Promise<WhatsAppResult<WhatsAppMessageView[]>> {
  const parsed = getRecentMessagesInput.safeParse(input)
  if (!parsed.success) {
    return failure("INVALID_INPUT", parsed.error.issues[0]?.message ?? "Invalid input")
  }
  const gate = await requireConnectedWithSyncedChats(userId)
  if (!gate.ok) return gate

  const { chatJid, sinceHours, limit } = parsed.data
  const since = sinceHours ? new Date(Date.now() - sinceHours * 60 * 60 * 1000) : undefined

  const messages = await db.whatsAppMessage.findMany({
    where: { userId, chatJid, ...(since ? { sentAt: { gte: since } } : {}) },
    orderBy: { sentAt: "desc" },
    take: limit ?? 50,
  })

  const chatNames = await chatNameLookup(userId, [chatJid])

  return {
    ok: true,
    // Oldest-first — easiest shape for the model to summarize chronologically.
    data: messages
      .slice()
      .reverse()
      .map((m) => ({
        chatJid: m.chatJid,
        chatName: chatNames.get(m.chatJid) ?? null,
        senderName: m.senderName,
        text: m.text,
        sentAt: m.sentAt.toISOString(),
        isFromMe: m.isFromMe,
      })),
  }
}

async function listSyncedChats(userId: string) {
  return db.whatsAppSyncedChat.findMany({ where: { userId }, orderBy: { chatName: "asc" } })
}

export type { WhatsAppResult, WhatsAppErrorCode, WhatsAppMessageView }
export { searchMessages, getRecentMessages, listSyncedChats }
