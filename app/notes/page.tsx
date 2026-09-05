import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"

import { getHeaderIdentity } from "@/lib/disala-user"
import { getOrCreateInternalUser } from "@/lib/get-or-create-user"
import { listNotes } from "@/lib/notes"
import { formatNoteTimestamp } from "@/lib/format-timestamp"
import { AppHeader } from "@/components/disala/app-header"
import { AppFooter } from "@/components/disala/app-footer"
import { SectionHeader } from "@/components/disala/section-header"
import { CaptureNoteButton } from "@/components/disala/capture-note-button"
import { NoteComposer } from "@/components/disala/note-composer"
import { NoteRow } from "@/components/disala/note-row"

const TITLE_FALLBACK_LENGTH = 48

export default async function NotesPage() {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) redirect("/sign-in")

  const internalUser = await getOrCreateInternalUser()
  if (!internalUser) redirect("/sign-in")

  const [{ name, avatarInitial, online }, notes] = await Promise.all([
    getHeaderIdentity(),
    listNotes(internalUser.id),
  ])

  return (
    <div className="relative flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-8 pb-32 sm:px-6">
        <AppHeader name={name} avatarInitial={avatarInitial} online={online} />

        <div className="flex flex-col gap-4">
          <SectionHeader title="Notes" meta={`${notes.length} total`} />
          <NoteComposer />
          <CaptureNoteButton />
          <div className="flex flex-col">
            {notes.map((note) => (
              <NoteRow
                key={note.id}
                noteId={note.id}
                title={
                  note.title ??
                  (note.content.length > TITLE_FALLBACK_LENGTH
                    ? `${note.content.slice(0, TITLE_FALLBACK_LENGTH)}…`
                    : note.content)
                }
                timestamp={formatNoteTimestamp(note.updatedAt)}
                preview={note.content}
              />
            ))}
          </div>
        </div>
      </main>

      <AppFooter active="notes" unreadCount={3} />
    </div>
  )
}
