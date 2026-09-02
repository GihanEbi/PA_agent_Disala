import { Mic } from "lucide-react"

import { cn } from "@/lib/utils"
import { Icon } from "@/components/disala/icon"

function VoiceOrb({
  size = 148,
  className,
}: {
  size?: number
  className?: string
}) {
  const outerSize = Math.round(size * 1.26)

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border border-neutral-700",
        className
      )}
      style={{ width: outerSize, height: outerSize }}
    >
      <span
        className="flex items-center justify-center rounded-full"
        style={{
          width: size,
          height: size,
          background:
            "radial-gradient(circle at 32% 30%, var(--color-gold-400), transparent 60%), radial-gradient(circle at 68% 70%, var(--color-teal-400), transparent 60%), var(--color-neutral-800)",
        }}
      >
        <Icon icon={Mic} size={Math.round(size * 0.22)} className="text-neutral-900" />
      </span>
    </span>
  )
}

export { VoiceOrb }
