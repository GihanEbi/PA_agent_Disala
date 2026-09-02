import { cn } from "@/lib/utils"

function NoteCard({
  title,
  timestamp,
  preview,
  className,
}: {
  title: string
  timestamp: string
  preview: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-md bg-card p-4 text-card-foreground",
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
