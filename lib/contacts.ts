import "server-only"

import { db } from "@/lib/db"
import { ContactSource } from "@/lib/generated/prisma/enums"

async function createContact({
  userId,
  name,
  company,
  title,
  email,
  phone,
  website,
  address,
  source = ContactSource.MANUAL,
}: {
  userId: string
  name: string
  company?: string | null
  title?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  address?: string | null
  source?: ContactSource
}) {
  return db.contact.create({
    data: {
      userId,
      name,
      company: company ?? null,
      title: title ?? null,
      email: email ?? null,
      phone: phone ?? null,
      website: website ?? null,
      address: address ?? null,
      source,
    },
  })
}

async function listContacts(userId: string) {
  return db.contact.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  })
}

/**
 * Updates a contact only if it belongs to `userId` — same ownership-scoped
 * shape as `deleteContact`. Returns whether a row was actually updated so
 * callers never assume success.
 */
async function updateContact({
  userId,
  contactId,
  name,
  company,
  title,
  email,
  phone,
  website,
  address,
}: {
  userId: string
  contactId: string
  name: string
  company?: string | null
  title?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  address?: string | null
}) {
  const { count } = await db.contact.updateMany({
    where: { id: contactId, userId },
    data: {
      name,
      company: company ?? null,
      title: title ?? null,
      email: email ?? null,
      phone: phone ?? null,
      website: website ?? null,
      address: address ?? null,
    },
  })
  return count > 0
}

/**
 * Deletes a contact only if it belongs to `userId` — the ownership check
 * lives in this query, not in a caller that could get it wrong. Returns
 * whether a row was actually deleted so callers never assume success.
 */
async function deleteContact({ userId, contactId }: { userId: string; contactId: string }) {
  const { count } = await db.contact.deleteMany({ where: { id: contactId, userId } })
  return count > 0
}

/**
 * Plain `contains` search over the signed-in user's own contacts only — no
 * full-text-search index yet, same reasoning as `searchNotes`.
 */
async function searchContacts({ userId, query }: { userId: string; query: string }) {
  return db.contact.findMany({
    where: {
      userId,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { company: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } },
        { phone: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
  })
}

export { createContact, listContacts, updateContact, deleteContact, searchContacts }
