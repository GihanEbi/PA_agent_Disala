// Worker-only, like client.ts — no `import "server-only"` (see its comment).
import { db } from "@/lib/db"

const DEFAULT_RETENTION_DAYS = 30

function getRetentionDays(): number {
  const raw = process.env.WHATSAPP_MESSAGE_RETENTION_DAYS
  const parsed = raw ? Number(raw) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_DAYS
}

/**
 * Deletes cached WhatsApp messages older than the retention window
 * (disala-17 decision #2) — run on an interval by the worker
 * (worker/whatsapp-worker.ts), never exposed to the app or the agent.
 */
async function pruneExpiredWhatsAppMessages(): Promise<number> {
  const cutoff = new Date(Date.now() - getRetentionDays() * 24 * 60 * 60 * 1000)
  const { count } = await db.whatsAppMessage.deleteMany({ where: { sentAt: { lt: cutoff } } })
  return count
}

export { pruneExpiredWhatsAppMessages }
