"use client"

import { useState, useTransition } from "react"
import { Send } from "lucide-react"

import { cn } from "@/lib/utils"
import { Icon } from "@/components/disala/icon"
import { Button } from "@/components/ui/button"
import { createNoteAction } from "@/app/notes/actions"

function NoteComposer({ className }: { className?: string }) {
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    const trimmed = value.trim()
    if (!trimmed || isPending) return
    setError(null)
    startTransition(async () => {
      try {
        await createNoteAction(trimmed)
        setValue("")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save that note.")
      }
    })
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-end gap-2 rounded-[20px] bg-input px-4 py-2">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              handleSubmit()
            }
          }}
          placeholder="Type a quick note…"
          rows={2}
          disabled={isPending}
          className="min-h-11 flex-1 resize-none bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-neutral-300 disabled:opacity-50"
        />
        <Button
          size="icon"
          aria-label="Save note"
          onClick={handleSubmit}
          disabled={isPending || !value.trim()}
          className="shrink-0"
        >
          <Icon icon={Send} size={16} />
        </Button>
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  )
}

export { NoteComposer }
