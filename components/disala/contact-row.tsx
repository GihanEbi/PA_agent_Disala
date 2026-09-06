"use client"

import { useState, useTransition } from "react"
import { Trash2 } from "lucide-react"

import { Icon } from "@/components/disala/icon"
import { ContactCard } from "@/components/disala/contact-card"
import { deleteContactAction } from "@/app/contacts/actions"

function ContactRow({
  contactId,
  name,
  subtitle,
  detail,
}: {
  contactId: string
  name: string
  subtitle: string
  detail: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (!window.confirm("Delete this contact?")) return
    setError(null)
    startTransition(async () => {
      try {
        await deleteContactAction(contactId)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't delete that contact.")
      }
    })
  }

  return (
    <div className="group relative">
      <ContactCard variant="flat" name={name} subtitle={subtitle} detail={detail} />
      <button
        type="button"
        aria-label="Delete contact"
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

export { ContactRow }
