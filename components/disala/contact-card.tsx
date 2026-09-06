import { cn } from "@/lib/utils"

function ContactCard({
  name,
  subtitle,
  detail,
  variant = "card",
  className,
}: {
  name: string
  subtitle: string
  detail: string
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
      <p className="text-[15px] leading-[21px] font-semibold text-foreground">{name}</p>
      {subtitle ? (
        <p className="text-xs font-bold text-neutral-500">{subtitle}</p>
      ) : null}
      {detail ? (
        <p className="mt-1 text-[13px] leading-[18px] font-medium text-neutral-300">
          {detail}
        </p>
      ) : null}
    </div>
  )
}

export { ContactCard }
