import "server-only"

import { db } from "@/lib/db"
import { ContactSource } from "@/lib/generated/prisma/enums"
import type { Contact } from "@/lib/generated/prisma/client"
import { findContactByAlias } from "@/lib/contact-aliases"
import { findFuzzyMatches, type FuzzyMatch } from "@/lib/fuzzy-match"

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
 * Checks a learned alias first (see lib/contact-aliases.ts), then does a
 * plain `contains` search over the signed-in user's own contacts — no
 * full-text-search index yet, same reasoning as `searchNotes`. Only when
 * both come back empty does it fall back to fuzzy (typo/mishearing-tolerant)
 * matching against every saved contact's name/email, so a near-miss surfaces
 * as a suggestion instead of a flat "not found".
 */
async function searchContacts({
  userId,
  query,
}: {
  userId: string
  query: string
}): Promise<{ exact: Contact[]; suggestions: FuzzyMatch<Contact>[] }> {
  const [aliasMatch, containsMatches] = await Promise.all([
    findContactByAlias({ userId, alias: query }),
    db.contact.findMany({
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
    }),
  ])

  const exact = aliasMatch
    ? [aliasMatch, ...containsMatches.filter((c) => c.id !== aliasMatch.id)]
    : containsMatches

  if (exact.length > 0) return { exact, suggestions: [] }

  const allContacts = await db.contact.findMany({ where: { userId } })
  const suggestions = findFuzzyMatches(query, allContacts, (c) => [c.name, c.email])

  return { exact: [], suggestions }
}

export { createContact, listContacts, updateContact, deleteContact, searchContacts }
