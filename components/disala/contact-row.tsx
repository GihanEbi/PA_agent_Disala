"use client"

import { useState, useTransition } from "react"
import { Pencil, Trash2 } from "lucide-react"

import { Icon } from "@/components/disala/icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ContactCard } from "@/components/disala/contact-card"
import { updateContactAction, deleteContactAction } from "@/app/contacts/actions"

type ContactFields = {
  name: string
  company: string
  title: string
  email: string
  phone: string
  website: string
  address: string
}

function ContactRow({ contactId, ...fields }: { contactId: string } & ContactFields) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState<ContactFields>(fields)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const subtitle = [fields.title, fields.company].filter(Boolean).join(" · ")
  const detail = [fields.email, fields.phone].filter(Boolean).join(" · ")

  function updateDraft(key: keyof ContactFields, value: string) {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  function handleEdit() {
    setDraft(fields)
    setError(null)
    setIsEditing(true)
  }

  function handleCancel() {
    setDraft(fields)
    setError(null)
    setIsEditing(false)
  }

  function handleSave() {
    if (!draft.name.trim() || isPending) return
    setError(null)
    startTransition(async () => {
      try {
        await updateContactAction(contactId, draft)
        setIsEditing(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save that contact.")
      }
    })
  }

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

  if (isEditing) {
    return (
      <div className="flex flex-col gap-2 border-b border-border py-4">
        <Input
          placeholder="Name"
          value={draft.name}
          onChange={(event) => updateDraft("name", event.target.value)}
          disabled={isPending}
        />
        <Input
          placeholder="Job title"
          value={draft.title}
          onChange={(event) => updateDraft("title", event.target.value)}
          disabled={isPending}
        />
        <Input
          placeholder="Company"
          value={draft.company}
          onChange={(event) => updateDraft("company", event.target.value)}
          disabled={isPending}
        />
        <Input
          placeholder="Email"
          value={draft.email}
          onChange={(event) => updateDraft("email", event.target.value)}
          disabled={isPending}
        />
        <Input
          placeholder="Phone"
          value={draft.phone}
          onChange={(event) => updateDraft("phone", event.target.value)}
          disabled={isPending}
        />
        <Input
          placeholder="Website"
          value={draft.website}
          onChange={(event) => updateDraft("website", event.target.value)}
          disabled={isPending}
        />
        <Input
          placeholder="Address"
          value={draft.address}
          onChange={(event) => updateDraft("address", event.target.value)}
          disabled={isPending}
        />
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <div className="flex gap-3">
          <Button variant="tertiary" onClick={handleCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending || !draft.name.trim()} className="flex-1">
            Save
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="group relative">
      <ContactCard variant="flat" name={fields.name} subtitle={subtitle} detail={detail} />
      <div className="absolute top-4 right-0 flex gap-3 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          aria-label="Edit contact"
          onClick={handleEdit}
          className="text-neutral-500 transition-colors hover:text-foreground"
        >
          <Icon icon={Pencil} size={16} />
        </button>
        <button
          type="button"
          aria-label="Delete contact"
          onClick={handleDelete}
          disabled={isPending}
          className="text-neutral-500 transition-colors hover:text-destructive disabled:opacity-50"
        >
          <Icon icon={Trash2} size={16} />
        </button>
      </div>
      {error ? <p className="pb-2 text-sm text-red-400">{error}</p> : null}
    </div>
  )
}

export { ContactRow }
