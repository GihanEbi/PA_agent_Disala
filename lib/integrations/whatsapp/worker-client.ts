import "server-only"

/**
 * The Next.js app's only way to reach the WhatsApp worker process
 * (disala-17 decision #1) — a thin fetch wrapper around
 * worker/whatsapp-control.ts's localhost HTTP surface. Every function here
 * fails soft (returns `{ok:false}`) when the worker isn't reachable, rather
 * than throwing — "the worker isn't running" is an expected, honestly
 * reported state, not a crash.
 */

const WORKER_BASE_URL = `http://127.0.0.1:${process.env.WHATSAPP_WORKER_PORT || 4178}`

type RuntimeInfo = { qrDataUrl: string | null; chats: { chatJid: string; chatName: string | null }[] }

async function requestConnect(
  connectionId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${WORKER_BASE_URL}/connect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connectionId, userId }),
    })
    if (!res.ok) return { ok: false, error: `WhatsApp connector responded ${res.status}` }
    return { ok: true }
  } catch {
    return { ok: false, error: "WhatsApp connector isn't running" }
  }
}

async function fetchRuntimeInfo(connectionId: string): Promise<RuntimeInfo | null> {
  try {
    const res = await fetch(
      `${WORKER_BASE_URL}/runtime?connectionId=${encodeURIComponent(connectionId)}`,
      { cache: "no-store" }
    )
    if (!res.ok) return null
    return (await res.json()) as RuntimeInfo
  } catch {
    return null
  }
}

async function requestDisconnect(
  connectionId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${WORKER_BASE_URL}/disconnect`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ connectionId }),
    })
    if (!res.ok) return { ok: false, error: `WhatsApp connector responded ${res.status}` }
    return { ok: true }
  } catch {
    return { ok: false, error: "WhatsApp connector isn't running" }
  }
}

export { requestConnect, fetchRuntimeInfo, requestDisconnect }
