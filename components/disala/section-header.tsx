import { cn } from "@/lib/utils"

function SectionHeader({
  title,
  meta,
  className,
}: {
  title: string
  meta: string
  className?: string
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", className)}>
      <h2 className="font-display text-lg leading-[23px] font-medium text-foreground">
        {title}
      </h2>
      <span className="text-sm text-neutral-300">{meta}</span>
    </div>
  )
}

export { SectionHeader }
