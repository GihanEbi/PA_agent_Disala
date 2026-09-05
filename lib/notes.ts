import "server-only"

import { db } from "@/lib/db"
import { CreationSource } from "@/lib/generated/prisma/enums"

async function createNote({
  userId,
  content,
  title,
  source = CreationSource.USER,
}: {
  userId: string
  content: string
  title?: string | null
  source?: CreationSource
}) {
  return db.note.create({
    data: { userId, content, title: title ?? null, source },
  })
}

async function listNotes(userId: string) {
  return db.note.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  })
}

/**
 * Deletes a note only if it belongs to `userId` — the ownership check lives
 * in this query, not in a caller that could get it wrong. Returns whether a
 * row was actually deleted so callers never assume success.
 */
async function deleteNote({ userId, noteId }: { userId: string; noteId: string }) {
  const { count } = await db.note.deleteMany({ where: { id: noteId, userId } })
  return count > 0
}

/**
 * Plain `contains` search over the signed-in user's own notes only — no
 * full-text-search index yet (see prompts/disala-06-gmail-calendar-tools.md),
 * a personal note collection doesn't need one.
 */
async function searchNotes({ userId, query }: { userId: string; query: string }) {
  return db.note.findMany({
    where: {
      userId,
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { content: { contains: query, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
  })
}

export { createNote, listNotes, deleteNote, searchNotes }
