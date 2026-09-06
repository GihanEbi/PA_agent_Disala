import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"

import { getOrCreateInternalUser } from "@/lib/get-or-create-user"
import { db } from "@/lib/db"
import { WhatsAppConnectionStatus } from "@/lib/generated/prisma/enums"
import { fetchRuntimeInfo } from "@/lib/integrations/whatsapp/worker-client"

// Heartbeat writes land roughly every 60s while a socket is open (see
// client.ts) — three missed heartbeats is a reasonable "the worker most
// likely isn't running anymore" threshold without flapping on one slow tick.
const STALE_AFTER_MS = 3 * 60_000

/**
 * Polled by the connect UI. Returns the cached DB status plus, while
 * PENDING_QR, the live QR code fetched from the worker — and flags a
 * CONNECTED row as `stale` if its heartbeat has gone quiet, so the UI never
 * implies a live connection the worker process may no longer be holding
 * (disala-17 error-handling requirement).
 */
export async function GET() {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }

  const internalUser = await getOrCreateInternalUser()
  if (!internalUser) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }

  const connection = await db.whatsAppConnection.findUnique({ where: { userId: internalUser.id } })
  if (!connection) {
    return NextResponse.json({ status: null })
  }

  let qrDataUrl: string | null = null
  if (connection.status === WhatsAppConnectionStatus.PENDING_QR) {
    const runtime = await fetchRuntimeInfo(connection.id)
    qrDataUrl = runtime?.qrDataUrl ?? null
  }

  const stale =
    connection.status === WhatsAppConnectionStatus.CONNECTED &&
    (!connection.lastSeenAt || Date.now() - connection.lastSeenAt.getTime() > STALE_AFTER_MS)

  return NextResponse.json({
    status: connection.status,
    phoneNumber: connection.phoneNumber,
    connectedAt: connection.connectedAt,
    riskAcknowledgedAt: connection.riskAcknowledgedAt,
    qrDataUrl,
    stale,
  })
}
