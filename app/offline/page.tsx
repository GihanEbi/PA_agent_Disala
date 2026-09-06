"use client"

import { WifiOff } from "lucide-react"

import { Icon } from "@/components/disala/icon"
import { Button } from "@/components/ui/button"

export default function OfflinePage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-8 text-center sm:px-6">
      <span className="flex size-14 items-center justify-center rounded-full bg-neutral-700 text-neutral-300">
        <Icon icon={WifiOff} size={28} />
      </span>
      <h1 className="font-display text-2xl leading-[29px] font-medium text-foreground">
        You&rsquo;re offline
      </h1>
      <p className="text-sm text-neutral-300">
        Disala needs a connection to reach your mail, calendar, and notes. Reconnect and try
        again.
      </p>
      <Button variant="primary" onClick={() => location.reload()}>
        Try again
      </Button>
    </div>
  )
}
