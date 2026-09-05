import { verifyWebhook } from "@clerk/nextjs/webhooks"
import { NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"

export async function POST(req: NextRequest) {
  let evt
  try {
    evt = await verifyWebhook(req)
  } catch (error) {
    console.error("Clerk webhook verification failed:", error)
    return new NextResponse("Verification failed", { status: 400 })
  }

  if (evt.type === "user.created" || evt.type === "user.updated") {
    const { id, email_addresses, primary_email_address_id, first_name, last_name } = evt.data
    const primaryEmail =
      email_addresses.find((e) => e.id === primary_email_address_id)?.email_address ??
      email_addresses[0]?.email_address

    if (!primaryEmail) {
      console.error(`Clerk webhook: user ${id} has no email address, skipping sync`)
      return NextResponse.json({ received: true })
    }

    const name = [first_name, last_name].filter(Boolean).join(" ") || null

    await db.user.upsert({
      where: { clerkId: id },
      update: { email: primaryEmail, name },
      create: { clerkId: id, email: primaryEmail, name },
    })
  }

  if (evt.type === "user.deleted") {
    const { id } = evt.data
    if (id) {
      await db.user.deleteMany({ where: { clerkId: id } })
    }
  }

  return NextResponse.json({ received: true })
}
