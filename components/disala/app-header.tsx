import { Show, SignInButton, UserButton } from "@clerk/nextjs"

import { cn } from "@/lib/utils"

const AVATAR_GRADIENT =
  "radial-gradient(circle at 30% 30%, var(--color-gold-400), transparent 65%), radial-gradient(circle at 70% 70%, var(--color-teal-400), transparent 65%), var(--color-neutral-700)"

function AppHeader({
  name,
  avatarInitial,
  online = true,
  className,
}: {
  name: string
  avatarInitial: string
  online?: boolean
  className?: string
}) {
  const now = new Date()
  const hour = now.getHours()
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
  const date = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })

  return (
    <header className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl leading-[29px] font-medium text-foreground">
          {greeting}, {name}
        </h1>
        <p className="text-sm text-neutral-300">{date}</p>
      </div>
      <span className="relative shrink-0">
        <Show when="signed-in">
          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: "size-11",
                userButtonTrigger:
                  "rounded-full focus:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-400",
              },
            }}
          />
        </Show>
        <Show when="signed-out">
          <SignInButton mode="modal">
            <button
              type="button"
              aria-label="Sign in"
              className="flex size-11 items-center justify-center rounded-full font-display text-lg font-medium text-neutral-900"
              style={{ background: AVATAR_GRADIENT }}
            >
              {avatarInitial}
            </button>
          </SignInButton>
        </Show>
        {online ? (
          <span className="absolute right-0 bottom-0 size-3 rounded-full bg-success ring-2 ring-background" />
        ) : null}
      </span>
    </header>
  )
}

export { AppHeader }
