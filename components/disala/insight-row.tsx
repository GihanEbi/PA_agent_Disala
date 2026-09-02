import { ChevronRight, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Icon } from "@/components/disala/icon"

type InsightTint = "attention" | "schedule" | "neutral"

const TINT_CLASSES: Record<InsightTint, string> = {
  attention: "bg-gold-500/15 text-gold-300",
  schedule: "bg-teal-500/15 text-teal-300",
  neutral: "bg-neutral-700 text-neutral-300",
}

function InsightRow({
  icon,
  tint,
  title,
  subtitle,
  className,
}: {
  icon: LucideIcon
  tint: InsightTint
  title: string
  subtitle: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b border-border py-4",
        className
      )}
    >
      <span
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-sm",
          TINT_CLASSES[tint]
        )}
      >
        <Icon icon={icon} size={20} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-[15px] leading-[21px] font-semibold text-foreground">
          {title}
        </p>
        <p className="truncate text-[13px] leading-[18px] font-medium text-neutral-300">
          {subtitle}
        </p>
      </div>
      <Icon icon={ChevronRight} size={20} className="shrink-0 text-neutral-500" />
    </div>
  )
}

export { InsightRow, type InsightTint }
