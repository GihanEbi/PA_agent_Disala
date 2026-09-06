"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import { getOrCreateInternalUser } from "@/lib/get-or-create-user"
import { createContact, updateContact, deleteContact } from "@/lib/contacts"
import { ContactSource } from "@/lib/generated/prisma/enums"

const CONTACTS_PATH = "/contacts"

async function createContactAction(fields: {
  name: string
  company?: string
  title?: string
  email?: string
  phone?: string
  website?: string
  address?: string
  source?: ContactSource
}) {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) throw new Error("Not signed in")

  const trimmedName = fields.name.trim()
  if (!trimmedName) throw new Error("A contact needs a name")

  const internalUser = await getOrCreateInternalUser()
  if (!internalUser) throw new Error("Not signed in")

  await createContact({
    userId: internalUser.id,
    name: trimmedName,
    company: fields.company?.trim() || null,
    title: fields.title?.trim() || null,
    email: fields.email?.trim() || null,
    phone: fields.phone?.trim() || null,
    website: fields.website?.trim() || null,
    address: fields.address?.trim() || null,
    source: fields.source ?? ContactSource.MANUAL,
  })
  revalidatePath(CONTACTS_PATH)
}

async function updateContactAction(
  contactId: string,
  fields: {
    name: string
    company?: string
    title?: string
    email?: string
    phone?: string
    website?: string
    address?: string
  }
) {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) throw new Error("Not signed in")

  const trimmedName = fields.name.trim()
  if (!trimmedName) throw new Error("A contact needs a name")

  const internalUser = await getOrCreateInternalUser()
  if (!internalUser) throw new Error("Not signed in")

  const updated = await updateContact({
    userId: internalUser.id,
    contactId,
    name: trimmedName,
    company: fields.company?.trim() || null,
    title: fields.title?.trim() || null,
    email: fields.email?.trim() || null,
    phone: fields.phone?.trim() || null,
    website: fields.website?.trim() || null,
    address: fields.address?.trim() || null,
  })
  if (!updated) throw new Error("Contact not found")
  revalidatePath(CONTACTS_PATH)
}

async function deleteContactAction(contactId: string) {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) throw new Error("Not signed in")

  const internalUser = await getOrCreateInternalUser()
  if (!internalUser) throw new Error("Not signed in")

  const deleted = await deleteContact({ userId: internalUser.id, contactId })
  if (!deleted) throw new Error("Contact not found")
  revalidatePath(CONTACTS_PATH)
}

export { createContactAction, updateContactAction, deleteContactAction }
