import { Mail, Calendar, FileText } from "lucide-react"
import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"

import { getHeaderIdentity } from "@/lib/disala-user"
import { getOrCreateInternalUser } from "@/lib/get-or-create-user"
import { searchEmails, getUnreadCount } from "@/lib/integrations/gmail"
import { getEvents, type CalendarEvent } from "@/lib/integrations/calendar"
import type { GoogleApiResult } from "@/lib/integrations/google-client"
import { listNotes } from "@/lib/notes"
import { formatEventTime } from "@/lib/format-timestamp"
import { parseFromHeader } from "@/lib/format-email"
import { AppHeader } from "@/components/disala/app-header"
import { AppFooter } from "@/components/disala/app-footer"
import { VoiceOrbTrigger } from "@/components/disala/voice-orb-trigger"
import { InsightRow, type InsightTint } from "@/components/disala/insight-row"

const DAY_EVENTS_CAP = 20
const BADGE_COUNT_CAP = 9
const UNREAD_SAMPLE_SIZE = 3

// BottomNav's badge is a fixed-size 16px circle sized for a single digit
// (same cap /mail's page already applies) — cap rather than resize the
// circle, since resizing it is a visual redesign with no reference to check
// it against.
function capBadgeCount(count: number) {
  return Math.min(count, BADGE_COUNT_CAP)
}

type Insight = {
  icon: typeof Mail
  tint: InsightTint
  title: string
  subtitle: string
  href: string
}

function buildMailInsight(
  unreadResult: GoogleApiResult<number>,
  sampleResult: GoogleApiResult<{ from: string }[]>
): Insight {
  if (!unreadResult.ok) {
    const notConnected =
      unreadResult.error.code === "NOT_CONNECTED" || unreadResult.error.code === "NEEDS_REAUTH"
    return {
      icon: Mail,
      tint: "attention",
      title: "Connect Gmail",
      subtitle: notConnected ? "Connect your Google account" : "Couldn't load right now",
      href: "/mail",
    }
  }

  const unreadCount = unreadResult.data
  if (unreadCount === 0) {
    return {
      icon: Mail,
      tint: "neutral",
      title: "Inbox zero",
      subtitle: "No unread emails",
      href: "/mail",
    }
  }

  const names = sampleResult.ok
    ? sampleResult.data.map((email) => parseFromHeader(email.from).name)
    : []
  const shown = names.slice(0, 2)
  const remaining = unreadCount - shown.length
  const subtitle =
    shown.length === 0
      ? "Tap to view your inbox"
      : remaining > 0
        ? `${shown.join(", ")}, and ${remaining} other${remaining === 1 ? "" : "s"}`
        : shown.join(" and ")

  return {
    icon: Mail,
    tint: "attention",
    title: `${unreadCount} unread email${unreadCount === 1 ? "" : "s"}`,
    subtitle,
    href: "/mail",
  }
}

/** The first event (in start-time order) that hasn't started yet. */
function findUpNext(events: CalendarEvent[], now: Date): CalendarEvent | null {
  for (const event of events) {
    if (!event.start) continue
    const start = new Date(event.start)
    if (!isNaN(start.getTime()) && start.getTime() >= now.getTime()) {
      return event
    }
  }
  return null
}

function buildCalendarInsight(eventsResult: GoogleApiResult<CalendarEvent[]>, now: Date): Insight {
  if (!eventsResult.ok) {
    const notConnected =
      eventsResult.error.code === "NOT_CONNECTED" || eventsResult.error.code === "NEEDS_REAUTH"
    return {
      icon: Calendar,
      tint: "schedule",
      title: "Connect Calendar",
      subtitle: notConnected ? "Connect your Google account" : "Couldn't load right now",
      href: "/calendar",
    }
  }

  const events = eventsResult.data
  if (events.length === 0) {
    return {
      icon: Calendar,
      tint: "neutral",
      title: "Nothing on your calendar",
      subtitle: "No meetings today",
      href: "/calendar",
    }
  }

  const meta = `${events.length} thing${events.length === 1 ? "" : "s"} today`
  const upNext = findUpNext(events, now)
  if (!upNext) {
    return {
      icon: Calendar,
      tint: "neutral",
      title: "No more meetings today",
      subtitle: meta,
      href: "/calendar",
    }
  }

  return {
    icon: Calendar,
    tint: "schedule",
    title: `${upNext.summary || "(no title)"} at ${formatEventTime(upNext.start)}`,
    subtitle: meta,
    href: "/calendar",
  }
}

function noteLabel(note: { title: string | null; content: string }) {
  if (note.title) return note.title
  const trimmed = note.content.trim().slice(0, 30)
  return trimmed.length < note.content.trim().length ? `${trimmed}…` : trimmed
}

function buildNotesInsight(notes: { title: string | null; content: string }[]): Insight {
  if (notes.length === 0) {
    return {
      icon: FileText,
      tint: "neutral",
      title: "No notes yet",
      subtitle: "Tap to add one",
      href: "/notes",
    }
  }

  const shown = notes.slice(0, 2).map(noteLabel)
  const remaining = notes.length - shown.length
  const subtitle = remaining > 0 ? `${shown.join(", ")}, and ${remaining} more` : shown.join(", ")

  return {
    icon: FileText,
    tint: "neutral",
    title: `${notes.length} note${notes.length === 1 ? "" : "s"} saved`,
    subtitle,
    href: "/notes",
  }
}

export default async function Home() {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) redirect("/sign-in")

  const internalUser = await getOrCreateInternalUser()
  if (!internalUser) redirect("/sign-in")

  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfTomorrow = new Date(startOfToday)
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)

  const [
    { name, avatarInitial, online },
    unreadResult,
    sampleResult,
    eventsResult,
    notes,
  ] = await Promise.all([
    getHeaderIdentity(),
    getUnreadCount(internalUser.id),
    searchEmails(internalUser.id, { unreadOnly: true, maxResults: UNREAD_SAMPLE_SIZE }),
    getEvents(internalUser.id, {
      timeMin: startOfToday.toISOString(),
      timeMax: startOfTomorrow.toISOString(),
      maxResults: DAY_EVENTS_CAP,
    }),
    listNotes(internalUser.id),
  ])

  const insights: Insight[] = [
    buildMailInsight(unreadResult, sampleResult),
    buildCalendarInsight(eventsResult, now),
    buildNotesInsight(notes),
  ]

  return (
    <div className="relative flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-10 px-4 pt-8 pb-32 sm:px-6">
        <AppHeader name={name} avatarInitial={avatarInitial} online={online} />

        <div className="flex flex-col items-center gap-4">
          <VoiceOrbTrigger />
          <p className="text-sm text-neutral-300">Tap and just start talking</p>
        </div>

        <div className="flex flex-col border-t border-border">
          {insights.map((insight) => (
            <InsightRow
              key={insight.title}
              icon={insight.icon}
              tint={insight.tint}
              title={insight.title}
              subtitle={insight.subtitle}
              href={insight.href}
            />
          ))}
        </div>
      </main>

      <AppFooter
        active="home"
        unreadCount={unreadResult.ok ? capBadgeCount(unreadResult.data) : undefined}
      />
    </div>
  )
}
