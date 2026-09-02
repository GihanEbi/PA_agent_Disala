import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-8 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-3 text-[13px] font-bold whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        // "Needs reply" — Attention (gold is action)
        attention: "bg-gold-500/15 text-gold-300",
        // "Replied" — Resolved (green is done)
        resolved: "bg-success/15 text-success",
        // "Up next" — Schedule (teal is time)
        schedule: "border-teal-500/40 bg-teal-500/15 text-teal-300",
        neutral: "bg-neutral-700 text-neutral-300",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
)

function Badge({
  className,
  variant = "neutral",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
