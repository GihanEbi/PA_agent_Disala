import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Icon } from "@/components/disala/icon"

function VoiceStateChip({
  label,
  onClose,
  className,
}: {
  label: string
  onClose?: () => void
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-full bg-card px-5 py-3",
        className
      )}
    >
      <span className="text-sm font-medium text-neutral-300">{label}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="text-neutral-300 transition-colors hover:text-foreground"
      >
        <Icon icon={X} size={18} />
      </button>
    </div>
  )
}

export { VoiceStateChip }
