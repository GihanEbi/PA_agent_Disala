import type { ComponentProps } from "react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Disala icons are always outline-only on a 24x24 grid with a 1.6px stroke —
 * this wrapper bakes that in so call sites never pass strokeWidth by hand.
 */
function Icon({
  icon: LucideIconComponent,
  className,
  size = 24,
  ...props
}: {
  icon: LucideIcon
  className?: string
  size?: number
} & Omit<ComponentProps<LucideIcon>, "size">) {
  return (
    <LucideIconComponent
      size={size}
      strokeWidth={1.6}
      className={cn("shrink-0", className)}
      {...props}
    />
  )
}

export { Icon }
