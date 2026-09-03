import { Mail, Calendar, FileText } from "lucide-react"

import { getHeaderIdentity } from "@/lib/disala-user"
import { AppHeader } from "@/components/disala/app-header"
import { AppFooter } from "@/components/disala/app-footer"
import { VoiceOrbTrigger } from "@/components/disala/voice-orb-trigger"
import { InsightRow, type InsightTint } from "@/components/disala/insight-row"

const INSIGHTS: {
  icon: typeof Mail
  tint: InsightTint
  title: string
  subtitle: string
  href: string
}[] = [
  {
    icon: Mail,
    tint: "attention",
    title: "3 emails need your reply",
    subtitle: "Priya and LankaHost and 1 other",
    href: "/mail",
  },
  {
    icon: Calendar,
    tint: "schedule",
    title: "Design sync at 9:30 AM",
    subtitle: "4 things today",
    href: "/calendar",
  },
  {
    icon: FileText,
    tint: "neutral",
    title: "3 notes saved",
    subtitle: "Kavindu's birthday ideas, Grocery list",
    href: "/notes",
  },
]

export default async function Home() {
  const { name, avatarInitial, online } = await getHeaderIdentity()

  return (
    <div className="relative flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-10 px-4 pt-8 pb-32 sm:px-6">
        <AppHeader name={name} avatarInitial={avatarInitial} online={online} />

        <div className="flex flex-col items-center gap-4">
          <VoiceOrbTrigger />
          <p className="text-sm text-neutral-300">Tap and just start talking</p>
        </div>

        <div className="flex flex-col border-t border-border">
          {INSIGHTS.map((insight) => (
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

      <AppFooter active="home" unreadCount={3} />
    </div>
  )
}
