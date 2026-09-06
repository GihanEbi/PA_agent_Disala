import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"

import { getHeaderIdentity } from "@/lib/disala-user"
import { getOrCreateInternalUser } from "@/lib/get-or-create-user"
import { listContacts } from "@/lib/contacts"
import { AppHeader } from "@/components/disala/app-header"
import { SectionHeader } from "@/components/disala/section-header"
import { ContactComposer } from "@/components/disala/contact-composer"
import { CaptureContactButton } from "@/components/disala/capture-contact-button"
import { ContactRow } from "@/components/disala/contact-row"

export default async function ContactsPage() {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) redirect("/sign-in")

  const internalUser = await getOrCreateInternalUser()
  if (!internalUser) redirect("/sign-in")

  const [{ name, avatarInitial, online }, contacts] = await Promise.all([
    getHeaderIdentity(),
    listContacts(internalUser.id),
  ])

  return (
    <div className="relative flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 pt-8 pb-8 sm:px-6">
        <AppHeader name={name} avatarInitial={avatarInitial} online={online} />

        <div className="flex flex-col gap-4">
          <SectionHeader title="Contacts" meta={`${contacts.length} saved`} />
          <ContactComposer />
          <CaptureContactButton />
          <div className="flex flex-col">
            {contacts.map((contact) => {
              const subtitle = [contact.title, contact.company].filter(Boolean).join(" · ")
              const detail = [contact.email, contact.phone].filter(Boolean).join(" · ")
              return (
                <ContactRow
                  key={contact.id}
                  contactId={contact.id}
                  name={contact.name}
                  subtitle={subtitle}
                  detail={detail}
                />
              )
            })}
          </div>
        </div>

        <Link href="/" className="text-sm text-teal-500 underline-offset-4 hover:underline">
          ← Back to Disala
        </Link>
      </main>
    </div>
  )
}
