"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Icon } from "@/components/disala/icon"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { VoiceStateChip } from "@/components/disala/voice-state-chip"
import { createContactAction } from "@/app/contacts/actions"
import { ContactSource } from "@/lib/generated/prisma/enums"

type ExtractedFields = {
  name?: string
  company?: string
  title?: string
  email?: string
  phone?: string
  website?: string
  address?: string
}

type Step = "capture" | "extracting" | "review" | "error"

const EMPTY_FIELDS: ExtractedFields = {}

function ScanCardSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>("capture")
  const [fields, setFields] = useState<ExtractedFields>(EMPTY_FIELDS)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = "hidden"

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose()
    }
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      document.documentElement.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  function reset() {
    setStep("capture")
    setFields(EMPTY_FIELDS)
    setErrorMessage(null)
    setSaveError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleChoosePhoto() {
    fileInputRef.current?.click()
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return

    setStep("extracting")
    setErrorMessage(null)

    try {
      const formData = new FormData()
      formData.append("image", file)

      const response = await fetch("/api/contacts/extract", { method: "POST", body: formData })
      const data = await response.json()

      if (!response.ok) {
        setErrorMessage(data.error ?? "Couldn't read that card — try again.")
        setStep("error")
        return
      }

      setFields(data.fields ?? {})
      setStep("review")
    } catch {
      setErrorMessage("Couldn't read that card — try again.")
      setStep("error")
    }
  }

  function updateField(key: keyof ExtractedFields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    const name = fields.name?.trim()
    if (!name || isSaving) return

    setIsSaving(true)
    setSaveError(null)

    try {
      await createContactAction({
        name,
        company: fields.company,
        title: fields.title,
        email: fields.email,
        phone: fields.phone,
        website: fields.website,
        address: fields.address,
        source: ContactSource.BUSINESS_CARD,
      })
      handleClose()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save that contact.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close scan business card"
        onClick={handleClose}
        className="absolute inset-0 bg-neutral-900/70"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Scan business card"
          className="pointer-events-auto flex max-h-[85vh] w-full max-w-md flex-col gap-6 overflow-y-auto rounded-t-lg border-t border-border bg-background px-6 pt-3 pb-8"
        >
          <span className="mx-auto h-1 w-9 rounded-full bg-neutral-700" />

          <div className="flex w-full items-center justify-between">
            <p className="font-display text-base font-medium text-foreground">
              Scan business card
            </p>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close"
              className="text-neutral-300 transition-colors hover:text-foreground"
            >
              <Icon icon={X} size={20} />
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelected}
          />

          {step === "capture" ? (
            <div className="flex flex-col items-center gap-4 py-6">
              <Button size="icon" className="size-16" onClick={handleChoosePhoto}>
                <Icon icon={Camera} size={26} />
              </Button>
              <p className="text-center text-sm text-neutral-300">
                Take or choose a photo of the business card
              </p>
            </div>
          ) : null}

          {step === "extracting" ? (
            <div className="flex justify-center py-6">
              <VoiceStateChip label="Reading card…" />
            </div>
          ) : null}

          {step === "error" ? (
            <div className="flex flex-col items-center gap-4 py-6">
              <p className="text-center text-sm text-red-400">{errorMessage}</p>
              <Button variant="secondary" onClick={() => setStep("capture")}>
                Try again
              </Button>
            </div>
          ) : null}

          {step === "review" ? (
            <div className="flex flex-col gap-3">
              <Input
                placeholder="Name"
                value={fields.name ?? ""}
                onChange={(event) => updateField("name", event.target.value)}
              />
              <Input
                placeholder="Job title"
                value={fields.title ?? ""}
                onChange={(event) => updateField("title", event.target.value)}
              />
              <Input
                placeholder="Company"
                value={fields.company ?? ""}
                onChange={(event) => updateField("company", event.target.value)}
              />
              <Input
                placeholder="Email"
                value={fields.email ?? ""}
                onChange={(event) => updateField("email", event.target.value)}
              />
              <Input
                placeholder="Phone"
                value={fields.phone ?? ""}
                onChange={(event) => updateField("phone", event.target.value)}
              />
              <Input
                placeholder="Website"
                value={fields.website ?? ""}
                onChange={(event) => updateField("website", event.target.value)}
              />
              <textarea
                placeholder="Address"
                value={fields.address ?? ""}
                onChange={(event) => updateField("address", event.target.value)}
                rows={2}
                className={cn(
                  "min-h-11 w-full resize-none rounded-[20px] bg-input px-4 py-3 text-sm text-foreground outline-none placeholder:text-neutral-300"
                )}
              />

              {saveError ? <p className="text-sm text-red-400">{saveError}</p> : null}

              <div className="flex gap-3">
                <Button variant="tertiary" onClick={() => setStep("capture")} disabled={isSaving}>
                  Retake
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving || !fields.name?.trim()}
                  className="flex-1"
                >
                  Save contact
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export { ScanCardSheet }
