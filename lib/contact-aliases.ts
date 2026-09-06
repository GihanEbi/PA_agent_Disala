import "server-only"

import { db } from "@/lib/db"

function normalizeAlias(alias: string) {
  return alias.trim().toLowerCase()
}

/**
 * Records that `alias` (as the user said or typed it) resolves to `contactId`
 * — called by the agent right after the user confirms an ambiguous or
 * misheard name, so the same text resolves directly next time. Re-verifies
 * the contact belongs to `userId` before writing, and overwrites any
 * previous mapping for the same (userId, alias) pair, since a repeat call is
 * expected to mean the user corrected an earlier, wrong resolution.
 */
async function saveContactAlias({
  userId,
  contactId,
  alias,
}: {
  userId: string
  contactId: string
  alias: string
}): Promise<{ ok: true; alias: string; contactId: string } | { ok: false; error: string }> {
  const normalized = normalizeAlias(alias)
  if (!normalized) return { ok: false, error: "Alias cannot be empty" }

  const contact = await db.contact.findFirst({ where: { id: contactId, userId } })
  if (!contact) return { ok: false, error: "Contact not found" }

  await db.contactAlias.upsert({
    where: { userId_alias: { userId, alias: normalized } },
    update: { contactId },
    create: { userId, contactId, alias: normalized },
  })

  return { ok: true, alias: normalized, contactId }
}

/** Case-insensitive exact lookup of a previously learned alias, scoped to `userId`. */
async function findContactByAlias({ userId, alias }: { userId: string; alias: string }) {
  const normalized = normalizeAlias(alias)
  if (!normalized) return null

  const match = await db.contactAlias.findUnique({
    where: { userId_alias: { userId, alias: normalized } },
    include: { contact: true },
  })

  return match?.contact ?? null
}

export { saveContactAlias, findContactByAlias }
