// No `import "server-only"` here: this module only ever runs inside the
// standalone worker process (worker/whatsapp-worker.ts, run via plain
// `tsx`/Node, not Next's bundler) — that guard throws unconditionally
// outside of Next's server compilation, so it would break the worker
// itself. Never import this file from anything under app/ (disala-17
// decision #1) — worker-client.ts is the only bridge the Next.js app uses.
import makeWASocket, {
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
  isJidUser,
  getContentType,
  normalizeMessageContent,
  jidDecode,
} from "@whiskeysockets/baileys"
import type { WASocket, WAMessage } from "@whiskeysockets/baileys"
import pino from "pino"
import QRCode from "qrcode"

import { db } from "@/lib/db"
import { loadWhatsAppAuthState } from "./auth-store"
import { WhatsAppConnectionStatus } from "@/lib/generated/prisma/enums"
import { Prisma } from "@/lib/generated/prisma/client"

/**
 * Worker-only socket lifecycle. This module holds live WhatsApp connections
 * in memory (one per linked user) — it must never be imported from app/
 * route handlers, which run per-request and can't keep a socket alive
 * (disala-17 decision #1). The Next.js app only ever talks to this through
 * worker/whatsapp-control.ts's local HTTP surface.
 */

const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL ?? "warn" })

type RuntimeState = {
  sock: WASocket
  userId: string
  qrDataUrl: string | null
  chats: Map<string, string | null>
  heartbeat: ReturnType<typeof setInterval> | null
}

const active = new Map<string, RuntimeState>()
const HEARTBEAT_MS = 60_000

function startHeartbeat(connectionId: string) {
  const rt = active.get(connectionId)
  if (!rt || rt.heartbeat) return
  rt.heartbeat = setInterval(() => {
    db.whatsAppConnection
      .update({ where: { id: connectionId }, data: { lastSeenAt: new Date() } })
      .catch((err) => logger.error({ err }, "whatsapp heartbeat write failed"))
  }, HEARTBEAT_MS)
}

function stopHeartbeat(connectionId: string) {
  const rt = active.get(connectionId)
  if (rt?.heartbeat) clearInterval(rt.heartbeat)
}

/**
 * Text only — media/other message types are intentionally never stored
 * (disala-17 out-of-scope). Must normalize before reading content type: a
 * disappearing-messages chat (a common default) wraps every message in
 * `ephemeralMessage`, and edited/view-once messages have their own
 * wrappers — `getContentType` on the raw message returns the wrapper's key,
 * not "conversation"/"extendedTextMessage", so every message would
 * silently be dropped without unwrapping it first.
 */
function extractText(message: WAMessage["message"] | null | undefined): string | null {
  const normalized = normalizeMessageContent(message ?? undefined)
  if (!normalized) return null
  const type = getContentType(normalized)
  if (type === "conversation") return normalized.conversation ?? null
  if (type === "extendedTextMessage") return normalized.extendedTextMessage?.text ?? null
  return null
}

async function persistIncomingMessages(userId: string, messages: WAMessage[]) {
  for (const msg of messages) {
    const chatJid = msg.key.remoteJid
    const waMessageId = msg.key.id
    if (!chatJid || !waMessageId || !isJidUser(chatJid)) continue // groups/broadcasts/status never stored

    const synced = await db.whatsAppSyncedChat.findUnique({
      where: { userId_chatJid: { userId, chatJid } },
    })
    if (!synced || !synced.syncing) continue

    const text = extractText(msg.message)
    if (!text) continue

    const sentAt = msg.messageTimestamp
      ? new Date(Number(msg.messageTimestamp) * 1000)
      : new Date()

    await db.whatsAppMessage.upsert({
      where: { userId_chatJid_waMessageId: { userId, chatJid, waMessageId } },
      update: {},
      create: {
        userId,
        chatJid,
        waMessageId,
        senderJid: msg.key.fromMe ? "me" : (msg.key.participant ?? chatJid),
        senderName: msg.pushName ?? null,
        text,
        isFromMe: !!msg.key.fromMe,
        sentAt,
      },
    })
  }
}

function rememberChat(connectionId: string, jid: string | undefined, name: string | null | undefined) {
  if (!jid || !isJidUser(jid)) return // group chats never offered for opt-in (disala-17 decision #5)
  const rt = active.get(connectionId)
  if (!rt) return
  const existing = rt.chats.get(jid)
  rt.chats.set(jid, name ?? existing ?? null)
}

/** Idempotent — a connectionId already live in this process is left alone. */
async function startWhatsAppConnection(connectionId: string, userId: string): Promise<void> {
  if (active.has(connectionId)) return

  const { state, saveCreds } = await loadWhatsAppAuthState(connectionId, logger)
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }))

  const sock = makeWASocket({
    auth: state,
    logger,
    browser: Browsers.macOS("Disala"),
    printQRInTerminal: false,
    markOnlineOnConnect: false,
    ...(version ? { version } : {}),
  })

  active.set(connectionId, { sock, userId, qrDataUrl: null, chats: new Map(), heartbeat: null })

  // Never let a rejected promise here become an unhandled rejection — since
  // Node 15+, that terminates the whole process (and every other user's
  // live connection with it), not just this one. A misconfigured
  // WHATSAPP_SESSION_ENCRYPTION_KEY or a transient DB write failure must
  // degrade this one connection, not take the worker down.
  sock.ev.on("creds.update", () => {
    saveCreds().catch((err) => logger.error({ err, connectionId }, "failed to save whatsapp creds"))
  })

  sock.ev.on("contacts.upsert", (contacts) => {
    for (const c of contacts) rememberChat(connectionId, c.id, c.name ?? c.notify ?? null)
  })
  sock.ev.on("chats.upsert", (chats) => {
    for (const c of chats) rememberChat(connectionId, c.id, c.name ?? null)
  })

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    // Only live, real-time deliveries — history-sync replays ("append") are
    // never persisted, matching the "no historical backfill" assumption.
    if (type !== "notify") return
    for (const msg of messages) {
      rememberChat(connectionId, msg.key.remoteJid ?? undefined, msg.pushName)
    }
    await persistIncomingMessages(userId, messages).catch((err) =>
      logger.error({ err }, "failed to persist whatsapp message")
    )
  })

  sock.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update
    const rt = active.get(connectionId)

    if (qr) {
      const qrDataUrl = await QRCode.toDataURL(qr)
      if (rt) rt.qrDataUrl = qrDataUrl
      await db.whatsAppConnection
        .update({
          where: { id: connectionId },
          data: { status: WhatsAppConnectionStatus.PENDING_QR },
        })
        .catch((err) => logger.error({ err }, "failed to record PENDING_QR status"))
    }

    if (connection === "open") {
      if (rt) rt.qrDataUrl = null
      const me = state.creds.me?.id
      const phoneNumber = me ? (jidDecode(me)?.user ?? null) : null
      await db.whatsAppConnection
        .update({
          where: { id: connectionId },
          data: {
            status: WhatsAppConnectionStatus.CONNECTED,
            phoneNumber,
            connectedAt: new Date(),
            lastSeenAt: new Date(),
          },
        })
        .catch((err) => logger.error({ err }, "failed to record CONNECTED status"))
      startHeartbeat(connectionId)
    }

    if (connection === "close") {
      stopHeartbeat(connectionId)
      active.delete(connectionId)

      const statusCode = (
        lastDisconnect?.error as { output?: { statusCode?: number } } | undefined
      )?.output?.statusCode

      if (statusCode === DisconnectReason.loggedOut) {
        // The account itself ended the session (user-initiated disconnect,
        // or WhatsApp revoked the link) — a fresh QR scan is required next
        // time, so the stale session material is discarded, not reused.
        await db.whatsAppConnection
          .update({
            where: { id: connectionId },
            data: { status: WhatsAppConnectionStatus.DISCONNECTED, sessionState: Prisma.JsonNull },
          })
          .catch((err) => logger.error({ err }, "failed to record DISCONNECTED status"))
        return
      }

      if (statusCode === DisconnectReason.badSession || statusCode === DisconnectReason.multideviceMismatch) {
        await db.whatsAppConnection
          .update({ where: { id: connectionId }, data: { status: WhatsAppConnectionStatus.ERROR } })
          .catch((err) => logger.error({ err }, "failed to record ERROR status"))
        return
      }

      // Anything else (dropped connection, restart required, timeout) is
      // transient — mark it and let the worker reconnect on its own, the
      // same resilience behavior Baileys' own docs recommend.
      await db.whatsAppConnection
        .update({ where: { id: connectionId }, data: { status: WhatsAppConnectionStatus.ERROR } })
        .catch((err) => logger.error({ err }, "failed to record ERROR status"))
      setTimeout(() => {
        startWhatsAppConnection(connectionId, userId).catch((err) =>
          logger.error({ err }, "whatsapp reconnect failed")
        )
      }, 3_000)
    }
  })
}

function getRuntimeInfo(connectionId: string) {
  const rt = active.get(connectionId)
  if (!rt) return null
  return {
    qrDataUrl: rt.qrDataUrl,
    chats: [...rt.chats.entries()].map(([chatJid, chatName]) => ({ chatJid, chatName })),
  }
}

/** User-initiated disconnect — always requires a fresh QR scan to relink. */
async function disconnectWhatsAppConnection(connectionId: string): Promise<void> {
  const rt = active.get(connectionId)
  if (!rt) {
    await db.whatsAppConnection.update({
      where: { id: connectionId },
      data: { status: WhatsAppConnectionStatus.DISCONNECTED },
    })
    return
  }
  await rt.sock.logout().catch((err) => logger.error({ err }, "whatsapp logout failed"))
  // sock.logout() triggers WhatsApp's own loggedOut close, which the
  // connection.update handler above turns into DISCONNECTED + cleared
  // session — nothing further to do here.
}

async function resumeAllConnections(): Promise<void> {
  const connections = await db.whatsAppConnection.findMany({
    where: { status: WhatsAppConnectionStatus.CONNECTED },
  })
  for (const connection of connections) {
    await startWhatsAppConnection(connection.id, connection.userId).catch((err) =>
      logger.error({ err, connectionId: connection.id }, "failed to resume whatsapp connection")
    )
  }
}

export { startWhatsAppConnection, disconnectWhatsAppConnection, resumeAllConnections, getRuntimeInfo }
