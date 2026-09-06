import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"

import { getHeaderIdentity } from "@/lib/disala-user"
import { getOrCreateInternalUser } from "@/lib/get-or-create-user"
import { getEvents, type CalendarEvent } from "@/lib/integrations/calendar"
import type { GoogleApiErrorCode } from "@/lib/integrations/google-client"
import { formatEventTime } from "@/lib/format-timestamp"
import { formatAttendeesLine } from "@/lib/format-event"
import { AppHeader } from "@/components/disala/app-header"
import { AppFooter } from "@/components/disala/app-footer"
import { SectionHeader } from "@/components/disala/section-header"
import { EventCard } from "@/components/disala/event-card"

const DAY_EVENTS_CAP = 20

function connectionMessage(code: GoogleApiErrorCode) {
  if (code === "NOT_CONNECTED") {
    return "Connect your Google account to see your calendar here."
  }
  if (code === "NEEDS_REAUTH") {
    return "Your Google connection needs to be reconnected."
  }
  return "Couldn't load your calendar right now."
}

/** The first event (in start-time order) that hasn't started yet. */
function findUpNextId(events: CalendarEvent[], now: Date): string | null {
  for (const event of events) {
    if (!event.start) continue
    const start = new Date(event.start)
    if (!isNaN(start.getTime()) && start.getTime() >= now.getTime()) {
      return event.id
    }
  }
  return null
}

export default async function CalendarPage() {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) redirect("/sign-in")

  const internalUser = await getOrCreateInternalUser()
  if (!internalUser) redirect("/sign-in")

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfTomorrow = new Date(startOfToday)
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)

  const [{ name, avatarInitial, online }, eventsResult] = await Promise.all([
    getHeaderIdentity(),
    getEvents(internalUser.id, {
      timeMin: startOfToday.toISOString(),
      timeMax: startOfTomorrow.toISOString(),
      maxResults: DAY_EVENTS_CAP,
    }),
  ])

  const events = eventsResult.ok ? eventsResult.data : []
  const upNextId = eventsResult.ok ? findUpNextId(events, now) : null
  const meta = eventsResult.ok
    ? `${events.length} thing${events.length === 1 ? "" : "s"} today`
    : "—"

  return (
    <div className="relative flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 pt-8 pb-32 sm:px-6">
        <AppHeader name={name} avatarInitial={avatarInitial} online={online} />

        <div className="flex flex-col gap-2">
          <SectionHeader title="Today" meta={meta} />

          {!eventsResult.ok ? (
            <div className="flex flex-col gap-3 rounded-md bg-card p-4 text-sm text-neutral-300">
              <p>{connectionMessage(eventsResult.error.code)}</p>
              {eventsResult.error.code === "NOT_CONNECTED" ||
              eventsResult.error.code === "NEEDS_REAUTH" ? (
                <Link
                  href="/settings/connections"
                  className="text-sm text-teal-500 underline-offset-4 hover:underline"
                >
                  Go to Connections →
                </Link>
              ) : null}
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-md bg-card p-4 text-sm text-neutral-300">
              Nothing on your calendar today.
            </div>
          ) : (
            <div className="flex flex-col">
              {events.map((event) => {
                const isUpNext = event.id === upNextId
                return (
                  <EventCard
                    key={event.id}
                    variant="flat"
                    time={formatEventTime(event.start)}
                    title={event.summary || "(no title)"}
                    attendees={formatAttendeesLine(event)}
                    upNext={isUpNext}
                    showAskDisala={isUpNext}
                  />
                )
              })}
            </div>
          )}
        </div>
      </main>

      <AppFooter active="calendar" unreadCount={3} />
    </div>
  )
}
