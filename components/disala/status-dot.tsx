import { Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { Icon } from "@/components/disala/icon"

type StatusVariant = "listening" | "speaking" | "saved" | "muted"

const STATUS_LABEL: Record<StatusVariant, string> = {
  listening: "Listening",
  speaking: "Speaking",
  saved: "Saved",
  muted: "Muted",
}

function StatusMark({ variant }: { variant: StatusVariant }) {
  if (variant === "saved") {
    return <Icon icon={Check} size={16} className="text-success" />
  }
  if (variant === "muted") {
    return (
      <span className="size-2.5 rounded-full border-2 border-neutral-500" />
    )
  }
  return (
    <span
      className={cn(
        "size-2.5 rounded-full",
        variant === "listening" && "bg-gold-500",
        variant === "speaking" && "bg-teal-400"
      )}
    />
  )
}

function StatusDot({
  variant,
  className,
}: {
  variant: StatusVariant
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 text-sm font-medium text-foreground",
        className
      )}
    >
      <StatusMark variant={variant} />
      {STATUS_LABEL[variant]}
    </span>
  )
}

export { StatusDot, type StatusVariant }
