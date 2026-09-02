import { cn } from "@/lib/utils"

function VoiceResponseCard({
  heading,
  subtext,
  className,
}: {
  heading: string
  subtext: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md bg-card p-4 text-card-foreground",
        className
      )}
    >
      <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-gold-500" />
      <div className="flex flex-col gap-0.5">
        <p className="text-[15px] leading-[21px] font-semibold text-foreground">
          {heading}
        </p>
        <p className="text-[13px] leading-[18px] font-medium text-neutral-300">
          {subtext}
        </p>
      </div>
    </div>
  )
}

export { VoiceResponseCard }
