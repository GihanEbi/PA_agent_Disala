"use client"

import { useState, useTransition } from "react"
import { Trash2 } from "lucide-react"

import { Icon } from "@/components/disala/icon"
import { NoteCard } from "@/components/disala/note-card"
import { deleteNoteAction } from "@/app/notes/actions"

function NoteRow({
  noteId,
  title,
  timestamp,
  preview,
}: {
  noteId: string
  title: string
  timestamp: string
  preview: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (!window.confirm("Delete this note?")) return
    setError(null)
    startTransition(async () => {
      try {
        await deleteNoteAction(noteId)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't delete that note.")
      }
    })
  }

  return (
    <div className="group relative">
      <NoteCard variant="flat" title={title} timestamp={timestamp} preview={preview} />
      <button
        type="button"
        aria-label="Delete note"
        onClick={handleDelete}
        disabled={isPending}
        className="absolute top-4 right-0 text-neutral-500 opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
      >
        <Icon icon={Trash2} size={16} />
      </button>
      {error ? <p className="pb-2 text-sm text-red-400">{error}</p> : null}
    </div>
  )
}

export { NoteRow }
