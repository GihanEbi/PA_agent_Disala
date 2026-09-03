import { getHeaderIdentity } from "@/lib/disala-user"
import { AppHeader } from "@/components/disala/app-header"
import { AppFooter } from "@/components/disala/app-footer"
import { SectionHeader } from "@/components/disala/section-header"
import { EventCard } from "@/components/disala/event-card"

const EVENTS: {
  time: string
  title: string
  attendees: string
  upNext: boolean
}[] = [
  {
    time: "9:30 AM",
    title: "Design sync",
    attendees: "Priya Fernando, Zoom",
    upNext: true,
  },
  {
    time: "12:00 PM",
    title: "Lunch",
    attendees: "Ishara Silva, The Lagoon Cafe",
    upNext: false,
  },
  {
    time: "2:00 PM",
    title: "Team standup",
    attendees: "Product team, Meeting room 2",
    upNext: false,
  },
  {
    time: "4:30 PM",
    title: "Client call",
    attendees: "Colombo Textiles, Phone",
    upNext: false,
  },
]

export default async function CalendarPage() {
  const { name, avatarInitial, online } = await getHeaderIdentity()

  return (
    <div className="relative flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 pt-8 pb-32 sm:px-6">
        <AppHeader name={name} avatarInitial={avatarInitial} online={online} />

        <div className="flex flex-col gap-2">
          <SectionHeader title="Today" meta="4 things today" />
          <div className="flex flex-col">
            {EVENTS.map((event) => (
              <EventCard
                key={event.title}
                variant="flat"
                time={event.time}
                title={event.title}
                attendees={event.attendees}
                upNext={event.upNext}
                showAskDisala={event.upNext}
              />
            ))}
          </div>
        </div>
      </main>

      <AppFooter active="calendar" unreadCount={3} />
    </div>
  )
}
