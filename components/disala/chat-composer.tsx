"use client"

import { useState } from "react"
import { Send } from "lucide-react"

import { Icon } from "@/components/disala/icon"
import { Button } from "@/components/ui/button"

function ChatComposer({
  onSend,
  disabled,
}: {
  onSend: (message: string) => void
  disabled?: boolean
}) {
  const [value, setValue] = useState("")

  function handleSubmit() {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue("")
  }

  return (
    <div className="flex w-full items-end gap-2 rounded-[20px] bg-input px-4 py-2">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            handleSubmit()
          }
        }}
        placeholder="Ask Disala anything…"
        rows={1}
        disabled={disabled}
        className="min-h-11 flex-1 resize-none bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-neutral-300 disabled:opacity-50"
      />
      <Button
        size="icon"
        aria-label="Send"
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        className="shrink-0"
      >
        <Icon icon={Send} size={16} />
      </Button>
    </div>
  )
}

export { ChatComposer }
