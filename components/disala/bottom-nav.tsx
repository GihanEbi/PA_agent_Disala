import {
  AudioLines,
  Mail,
  Calendar,
  FileText,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Icon } from "@/components/disala/icon"

type NavKey = "home" | "mail" | "calendar" | "notes"

const NAV_ITEMS: { key: NavKey; label: string; icon: LucideIcon }[] = [
  { key: "home", label: "Home", icon: AudioLines },
  { key: "mail", label: "Mail", icon: Mail },
  { key: "calendar", label: "Calendar", icon: Calendar },
  { key: "notes", label: "Notes", icon: FileText },
]

function BottomNav({
  active,
  unreadCount,
  className,
}: {
  active: NavKey
  unreadCount?: number
  className?: string
}) {
  return (
    <nav
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-card p-1.5",
        className
      )}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = item.key === active
        return (
          <button
            key={item.key}
            type="button"
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-1 rounded-full px-4 py-2 text-[11.5px] leading-[14px] font-bold transition-colors",
              isActive ? "text-foreground" : "text-neutral-500"
            )}
          >
            <Icon icon={item.icon} size={20} />
            {item.key === "mail" && unreadCount ? (
              <span className="absolute top-0.5 right-3 flex size-4 items-center justify-center rounded-full bg-gold-500 text-[10px] font-bold text-neutral-900">
                {unreadCount}
              </span>
            ) : null}
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

export { BottomNav, type NavKey }
