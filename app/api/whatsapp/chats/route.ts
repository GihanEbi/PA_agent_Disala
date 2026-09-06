import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"

import { getOrCreateInternalUser } from "@/lib/get-or-create-user"
import { db } from "@/lib/db"
import { WhatsAppConnectionStatus } from "@/lib/generated/prisma/enums"
import { fetchRuntimeInfo } from "@/lib/integrations/whatsapp/worker-client"

/**
 * Lists 1:1 chats available to opt into syncing (discovered live by the
 * worker's socket — group JIDs are never included, see client.ts's
 * rememberChat) merged with each chat's current opt-in state. Never lists
 * group chats at all, not just leaves them unchecked (disala-17 decision #5).
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
  if (!connection || connection.status !== WhatsAppConnectionStatus.CONNECTED) {
    return NextResponse.json({ error: "WhatsApp isn't connected" }, { status: 409 })
  }

  const [runtime, syncedChats] = await Promise.all([
    fetchRuntimeInfo(connection.id),
    db.whatsAppSyncedChat.findMany({ where: { userId: internalUser.id } }),
  ])

  const syncedByJid = new Map(syncedChats.map((c) => [c.chatJid, c]))
  const discovered = runtime?.chats ?? []

  // Union of what the live socket has seen and what's already opted in, so a
  // chat opted into earlier still shows even if it hasn't produced a new
  // message (and therefore a fresh discovery) since the worker last started.
  const allJids = new Set([...discovered.map((c) => c.chatJid), ...syncedByJid.keys()])

  const chats = [...allJids].map((chatJid) => {
    const known = discovered.find((c) => c.chatJid === chatJid)
    const synced = syncedByJid.get(chatJid)
    return {
      chatJid,
      chatName: known?.chatName ?? synced?.chatName ?? null,
      syncing: synced?.syncing ?? false,
    }
  })

  return NextResponse.json({ chats })
}

/**
 * Toggles whether an opted-in chat's future messages get cached. Rejects
 * group JIDs defensively even though the picker never offers them.
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

  const connection = await db.whatsAppConnection.findUnique({ where: { userId: internalUser.id } })
  if (!connection || connection.status !== WhatsAppConnectionStatus.CONNECTED) {
    return NextResponse.json({ error: "WhatsApp isn't connected" }, { status: 409 })
  }

  const body = await req.json().catch(() => null)
  const chatJid = typeof body?.chatJid === "string" ? body.chatJid : null
  const syncing = body?.syncing === true
  const chatName = typeof body?.chatName === "string" ? body.chatName : null

  if (!chatJid || chatJid.endsWith("@g.us")) {
    return NextResponse.json({ error: "A valid 1:1 chat id is required" }, { status: 400 })
  }

  const synced = await db.whatsAppSyncedChat.upsert({
    where: { userId_chatJid: { userId: internalUser.id, chatJid } },
    update: { syncing, ...(chatName ? { chatName } : {}) },
    create: {
      userId: internalUser.id,
      connectionId: connection.id,
      chatJid,
      chatName,
      syncing,
    },
  })

  return NextResponse.json({ chatJid: synced.chatJid, syncing: synced.syncing })
}
