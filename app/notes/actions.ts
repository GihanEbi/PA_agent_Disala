"use server"

import { auth } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"

import { getOrCreateInternalUser } from "@/lib/get-or-create-user"
import { createNote, deleteNote } from "@/lib/notes"

const NOTES_PATH = "/notes"

async function createNoteAction(content: string) {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) throw new Error("Not signed in")

  const trimmed = content.trim()
  if (!trimmed) throw new Error("Note can't be empty")

  const internalUser = await getOrCreateInternalUser()
  if (!internalUser) throw new Error("Not signed in")

  await createNote({ userId: internalUser.id, content: trimmed })
  revalidatePath(NOTES_PATH)
}

async function deleteNoteAction(noteId: string) {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) throw new Error("Not signed in")

  const internalUser = await getOrCreateInternalUser()
  if (!internalUser) throw new Error("Not signed in")

  const deleted = await deleteNote({ userId: internalUser.id, noteId })
  if (!deleted) throw new Error("Note not found")
  revalidatePath(NOTES_PATH)
}

export { createNoteAction, deleteNoteAction }
