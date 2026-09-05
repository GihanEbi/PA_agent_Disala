import { getHeaderIdentity } from "@/lib/disala-user"
import { AppHeader } from "@/components/disala/app-header"
import { AppFooter } from "@/components/disala/app-footer"
import { SectionHeader } from "@/components/disala/section-header"
import { CaptureNoteButton } from "@/components/disala/capture-note-button"
import { NoteCard } from "@/components/disala/note-card"

const NOTES: { title: string; timestamp: string; preview: string }[] = [
  {
    title: "Kavindu's birthday ideas",
    timestamp: "Yesterday, 9:12 PM",
    preview:
      "Maybe the lagoon place for dinner, get the record he mentioned, keep it a small group.",
  },
  {
    title: "Grocery list",
    timestamp: "Yesterday, 6:03 PM",
    preview: "Rice, coconut, king fish, curry leaves, lime.",
  },
  {
    title: "Follow up with Zeynep",
    timestamp: "Monday, 3:47 PM",
    preview:
      "She wants the revised quote by Wednesday. Mention the discount for early payment.",
  },
]

export default async function NotesPage() {
  const { name, avatarInitial, online } = await getHeaderIdentity()

  return (
    <div className="relative flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-8 pb-32 sm:px-6">
        <AppHeader name={name} avatarInitial={avatarInitial} online={online} />

        <div className="flex flex-col gap-4">
          <SectionHeader title="Notes" meta="3 total" />
          <CaptureNoteButton />
          <div className="flex flex-col">
            {NOTES.map((note) => (
              <NoteCard
                key={note.title}
                variant="flat"
                title={note.title}
                timestamp={note.timestamp}
                preview={note.preview}
              />
            ))}
          </div>
        </div>
      </main>

      <AppFooter active="notes" unreadCount={3} />
    </div>
  )
}
