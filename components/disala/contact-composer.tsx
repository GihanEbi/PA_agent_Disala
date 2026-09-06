"use client"

import { useState, useTransition } from "react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { createContactAction } from "@/app/contacts/actions"

function ContactComposer({ className }: { className?: string }) {
  const [name, setName] = useState("")
  const [company, setCompany] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    const trimmedName = name.trim()
    if (!trimmedName || isPending) return
    setError(null)
    startTransition(async () => {
      try {
        await createContactAction({ name: trimmedName, company, email, phone })
        setName("")
        setCompany("")
        setEmail("")
        setPhone("")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't save that contact.")
      }
    })
  }

  return (
    <div className={cn("flex flex-col gap-2 rounded-md bg-card p-4", className)}>
      <div className="grid grid-cols-2 gap-2">
        <Input
          placeholder="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={isPending}
          className="col-span-2"
        />
        <Input
          placeholder="Company"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          disabled={isPending}
        />
        <Input
          placeholder="Phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          disabled={isPending}
        />
        <Input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isPending}
          className="col-span-2"
        />
      </div>
      <Button onClick={handleSubmit} disabled={isPending || !name.trim()}>
        Save contact
      </Button>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
    </div>
  )
}

export { ContactComposer }
