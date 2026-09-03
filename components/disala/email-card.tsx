import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

function EmailCard({
  initials,
  sender,
  subject,
  preview,
  time,
  status,
  replyLabel,
  variant = "card",
  className,
}: {
  initials: string
  sender: string
  subject: string
  preview: string
  time: string
  status?: string
  replyLabel?: string
  variant?: "card" | "flat"
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        variant === "card"
          ? "rounded-md bg-card p-4 text-card-foreground"
          : "border-b border-border py-4",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-[13px] font-bold text-neutral-300">
          {initials}
        </span>
        <span className="text-xs font-bold text-neutral-500">{time}</span>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[15px] leading-[21px] font-semibold text-foreground">
          {sender}
        </p>
        <p className="text-sm leading-5 font-medium text-foreground">
          {subject}
        </p>
        <p className="truncate text-[13px] leading-[18px] font-medium text-neutral-300">
          {preview}
        </p>
      </div>
      {status ? (
        <div className="flex items-center gap-3">
          <Badge variant="attention">{status}</Badge>
          {replyLabel ? <Button variant="text">{replyLabel}</Button> : null}
        </div>
      ) : null}
    </div>
  )
}

export { EmailCard }
