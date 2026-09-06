import { NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"

import { getOrCreateInternalUser } from "@/lib/get-or-create-user"
import { db } from "@/lib/db"
import { requestDisconnect } from "@/lib/integrations/whatsapp/worker-client"

/**
 * Logs the linked WhatsApp account out. The DB status/session are updated by
 * the worker itself once the socket actually closes (client.ts's
 * connection.update handler) — this route never optimistically marks the
 * connection disconnected on its own, since that would claim an outcome
 * before the provider (WhatsApp, via the worker) confirmed it
 * (AGENTS.md §7.5). If the worker can't be reached at all, this fails
 * honestly rather than pretending the disconnect happened.
 */
export async function POST() {
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
    return NextResponse.json({ error: "WhatsApp isn't connected" }, { status: 409 })
  }

  const result = await requestDisconnect(connection.id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
