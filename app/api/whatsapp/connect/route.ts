import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"

import { getOrCreateInternalUser } from "@/lib/get-or-create-user"
import { db } from "@/lib/db"
import { WhatsAppConnectionStatus } from "@/lib/generated/prisma/enums"
import { requestConnect } from "@/lib/integrations/whatsapp/worker-client"

/**
 * Starts (or resumes) pairing for the signed-in user's WhatsApp connection.
 * Requires the risk disclosure to already be acknowledged, or acknowledges
 * it in this same request (disala-17 decision #8) — pairing never starts
 * silently. The actual QR code is fetched separately via GET
 * /api/whatsapp/status, which polls the worker for it.
 */
export async function POST(req: NextRequest) {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }

  const internalUser = await getOrCreateInternalUser()
  if (!internalUser) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const riskAcknowledged = body?.riskAcknowledged === true

  let connection = await db.whatsAppConnection.findUnique({ where: { userId: internalUser.id } })

  if (!connection?.riskAcknowledgedAt && !riskAcknowledged) {
    return NextResponse.json(
      { error: "The WhatsApp risk disclosure must be acknowledged before connecting." },
      { status: 400 }
    )
  }

  connection = await db.whatsAppConnection.upsert({
    where: { userId: internalUser.id },
    update: {
      riskAcknowledgedAt: connection?.riskAcknowledgedAt ?? new Date(),
      status: WhatsAppConnectionStatus.PENDING_QR,
    },
    create: {
      userId: internalUser.id,
      riskAcknowledgedAt: new Date(),
      status: WhatsAppConnectionStatus.PENDING_QR,
    },
  })

  const result = await requestConnect(connection.id, internalUser.id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 })
  }

  return NextResponse.json({ connectionId: connection.id, status: connection.status })
}
