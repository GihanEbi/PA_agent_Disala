import "server-only"
import { clerkClient } from "@clerk/nextjs/server"

import { db } from "@/lib/db"
import { ConnectedAccountProvider, ConnectedAccountStatus } from "@/lib/generated/prisma/enums"

/**
 * Reads the current live state of `clerkUserId`'s Google external account
 * from Clerk (the source of truth — Clerk holds the real access/refresh
 * tokens) and upserts our own `ConnectedAccount` read-model to match.
 *
 * Called from the connections page on render and from the Server Action
 * fired right after connect/reauthorize/disconnect, so the cache is fresh
 * exactly when it's displayed or just changed. Never deletes the row on
 * disconnect — marks it REVOKED, preserving the audit trail.
 */
async function syncGoogleConnectedAccount(internalUserId: string, clerkUserId: string) {
  const client = await clerkClient()
  const clerkUser = await client.users.getUser(clerkUserId)
  const googleAccount = clerkUser.externalAccounts.find(
    (account) => account.provider === "google"
  )

  if (!googleAccount) {
    await db.connectedAccount.updateMany({
      where: {
        userId: internalUserId,
        provider: ConnectedAccountProvider.GOOGLE,
        status: { not: ConnectedAccountStatus.REVOKED },
      },
      data: { status: ConnectedAccountStatus.REVOKED },
    })
    return null
  }

  const status =
    googleAccount.verification?.status === "verified"
      ? ConnectedAccountStatus.ACTIVE
      : ConnectedAccountStatus.NEEDS_REAUTH
  const scopes = googleAccount.approvedScopes ? googleAccount.approvedScopes.split(" ") : []

  return db.connectedAccount.upsert({
    where: {
      userId_provider_providerAccountId: {
        userId: internalUserId,
        provider: ConnectedAccountProvider.GOOGLE,
        providerAccountId: googleAccount.providerUserId,
      },
    },
    update: { providerEmail: googleAccount.emailAddress, scopes, status },
    create: {
      userId: internalUserId,
      provider: ConnectedAccountProvider.GOOGLE,
      providerAccountId: googleAccount.providerUserId,
      providerEmail: googleAccount.emailAddress,
      scopes,
      status,
    },
  })
}

async function getGoogleConnectedAccount(internalUserId: string) {
  return db.connectedAccount.findFirst({
    where: { userId: internalUserId, provider: ConnectedAccountProvider.GOOGLE },
    orderBy: { updatedAt: "desc" },
  })
}

/**
 * Flips the cached Google connection to NEEDS_REAUTH directly, without a
 * live Clerk round-trip — used when a Gmail/Calendar API call itself just
 * returned 401, which already tells us the token Clerk handed out is no
 * longer good. `syncGoogleConnectedAccount` remains the fuller sync (also
 * handles a fully-removed external account); this is the cheaper, narrower
 * update for this one specific, already-confirmed failure.
 */
async function markGoogleConnectionNeedsReauth(internalUserId: string) {
  await db.connectedAccount.updateMany({
    where: {
      userId: internalUserId,
      provider: ConnectedAccountProvider.GOOGLE,
      status: { not: ConnectedAccountStatus.REVOKED },
    },
    data: { status: ConnectedAccountStatus.NEEDS_REAUTH },
  })
}

export {
  syncGoogleConnectedAccount,
  getGoogleConnectedAccount,
  markGoogleConnectionNeedsReauth,
}
