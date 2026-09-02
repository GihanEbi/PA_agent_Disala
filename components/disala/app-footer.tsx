import { Mic } from "lucide-react"

import { cn } from "@/lib/utils"
import { Icon } from "@/components/disala/icon"
import { Button } from "@/components/ui/button"
import { BottomNav, type NavKey } from "@/components/disala/bottom-nav"

function AppFooter({
  active,
  unreadCount,
  className,
}: {
  active: NavKey
  unreadCount?: number
  className?: string
}) {
  return (
    <div className={cn("fixed inset-x-0 bottom-0 z-20", className)}>
      <div className="mx-auto flex max-w-md flex-col items-center">
        <Button
          size="icon"
          aria-label="Talk to Disala"
          className="relative z-10 mb-[-28px] size-16 shadow-xl shadow-gold-500/30"
        >
          <Icon icon={Mic} size={26} />
        </Button>
        <BottomNav
          active={active}
          unreadCount={unreadCount}
          className="w-full justify-around gap-0 rounded-none border-t border-border bg-background px-4 pt-9 pb-4"
        />
      </div>
    </div>
  )
}

export { AppFooter }
