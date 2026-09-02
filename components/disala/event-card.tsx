import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

function EventCard({
  time,
  title,
  attendees,
  upNext,
  className,
}: {
  time: string
  title: string
  attendees: string
  upNext?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-md bg-card p-4 text-card-foreground",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[15px] leading-[21px] font-semibold text-foreground">
          {time}
        </p>
        {upNext ? <Badge variant="schedule">Up next</Badge> : null}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm leading-5 font-medium text-foreground">
          {title}
        </p>
        <p className="text-[13px] leading-[18px] font-medium text-neutral-300">
          {attendees}
        </p>
      </div>
      <Button variant="text">Ask Disala</Button>
    </div>
  )
}

export { EventCard }
