import "server-only"
import { currentUser } from "@clerk/nextjs/server"

import { db } from "@/lib/db"

/**
 * Resolves the internal `User` row for the current Clerk session, creating
 * it on demand if the `user.created` webhook hasn't landed yet — webhooks
 * are eventually consistent, and a brand-new sign-up can reach an
 * authenticated page before Clerk delivers that event. The webhook
 * (app/api/webhooks/clerk/route.ts) stays the source of truth for updates
 * and deletes; this is only the synchronous-safe fallback for creation.
 *
 * Returns `null` if there's no signed-in Clerk user.
 */
async function getOrCreateInternalUser() {
  const clerkUser = await currentUser()
  if (!clerkUser) return null

  const primaryEmail =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress

  if (!primaryEmail) {
    throw new Error(`Clerk user ${clerkUser.id} has no email address`)
  }

  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null

  return db.user.upsert({
    where: { clerkId: clerkUser.id },
    update: { email: primaryEmail, name },
    create: { clerkId: clerkUser.id, email: primaryEmail, name },
  })
}

export { getOrCreateInternalUser }
