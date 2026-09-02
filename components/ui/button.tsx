import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-sans text-[13px] font-bold transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          "h-11 rounded-full bg-gold-400 px-6 text-neutral-900 hover:bg-gold-300 disabled:bg-gold-400/40 disabled:text-neutral-900/50",
        secondary:
          "h-11 rounded-full border border-gold-400 bg-transparent px-6 text-gold-400 hover:bg-gold-400/10 disabled:border-neutral-500 disabled:text-neutral-500",
        tertiary:
          "h-11 rounded-full bg-neutral-700 px-6 text-warm-white hover:bg-neutral-700/70 disabled:bg-neutral-800 disabled:text-neutral-500",
        text: "h-auto rounded-sm bg-transparent p-0 text-teal-500 underline-offset-4 hover:underline disabled:text-neutral-500",
      },
      size: {
        default: "",
        icon: "aspect-square h-11 w-11 rounded-full px-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "primary",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
