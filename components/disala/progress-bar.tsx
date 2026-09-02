import { cn } from "@/lib/utils"

function ProgressBar({
  label,
  percent,
  helperText,
  className,
}: {
  label: string
  percent: number
  helperText?: string
  className?: string
}) {
  const clamped = Math.min(100, Math.max(0, percent))
  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-sm font-medium text-foreground">
          {clamped}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-700"
      >
        <div
          className="h-full rounded-full bg-gold-400"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {helperText ? (
        <p className="mt-2 text-sm text-neutral-300">{helperText}</p>
      ) : null}
    </div>
  )
}

export { ProgressBar }
