"use client"

import { Camera } from "lucide-react"

import { cn } from "@/lib/utils"
import { Icon } from "@/components/disala/icon"
import { useScanCardSheet } from "@/components/disala/scan-card-sheet-context"

function CaptureContactButton({ className }: { className?: string }) {
  const { openSheet } = useScanCardSheet()

  return (
    <button
      type="button"
      onClick={openSheet}
      className={cn(
        "flex items-center gap-2 rounded-full border border-dashed border-neutral-700 px-5 py-3 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:text-foreground",
        className
      )}
    >
      <Icon icon={Camera} size={18} className="text-gold-400" />
      Scan a business card
    </button>
  )
}

export { CaptureContactButton }
