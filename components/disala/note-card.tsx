import { cn } from "@/lib/utils"

function NoteCard({
  title,
  timestamp,
  preview,
  variant = "card",
  className,
}: {
  title: string
  timestamp: string
  preview: string
  variant?: "card" | "flat"
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        variant === "card"
          ? "rounded-md bg-card p-4 text-card-foreground"
          : "border-b border-border py-4",
        className
      )}
    >
      <p className="text-[15px] leading-[21px] font-semibold text-foreground">
        {title}
      </p>
      <p className="text-xs font-bold text-neutral-500">{timestamp}</p>
      <p className="mt-1 text-[13px] leading-[18px] font-medium text-neutral-300">
        {preview}
      </p>
    </div>
  )
}

export { NoteCard }
