"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import { getOrCreateInternalUser } from "@/lib/get-or-create-user"
import { syncGoogleConnectedAccount } from "@/lib/connected-accounts"

const CONNECTIONS_PATH = "/settings/connections"

async function syncConnectedAccountsAction() {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) {
    throw new Error("Not signed in")
  }

  const internalUser = await getOrCreateInternalUser()
  if (!internalUser) {
    throw new Error("Not signed in")
  }

  await syncGoogleConnectedAccount(internalUser.id, clerkUserId)
  revalidatePath(CONNECTIONS_PATH)
}

export { syncConnectedAccountsAction }
