import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"

import { getHeaderIdentity } from "@/lib/disala-user"
import { getOrCreateInternalUser } from "@/lib/get-or-create-user"
import { syncGoogleConnectedAccount } from "@/lib/connected-accounts"
import { AppHeader } from "@/components/disala/app-header"
import { SectionHeader } from "@/components/disala/section-header"
import { GoogleConnectionCard } from "@/components/disala/google-connection-card"
import { WhatsAppConnectionCard } from "@/components/disala/whatsapp-connection-card"

export default async function ConnectionsPage() {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) redirect("/sign-in")

  const internalUser = await getOrCreateInternalUser()
  if (!internalUser) redirect("/sign-in")

  await syncGoogleConnectedAccount(internalUser.id, clerkUserId)

  const { name, avatarInitial, online } = await getHeaderIdentity()

  return (
    <div className="relative flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 pt-8 pb-8 sm:px-6">
        <AppHeader name={name} avatarInitial={avatarInitial} online={online} />

        <div className="flex flex-col gap-4">
          <SectionHeader title="Connections" meta="2 available" />
          <GoogleConnectionCard />
          <WhatsAppConnectionCard />
        </div>

        <Link href="/" className="text-sm text-teal-500 underline-offset-4 hover:underline">
          ← Back to Disala
        </Link>
      </main>
    </div>
  )
}
