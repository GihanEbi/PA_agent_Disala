import { Mail, Calendar, FileText } from "lucide-react"

import { AppHeader } from "@/components/disala/app-header"
import { AppFooter } from "@/components/disala/app-footer"
import { VoiceOrb } from "@/components/disala/voice-orb"
import { InsightRow, type InsightTint } from "@/components/disala/insight-row"

const INSIGHTS: {
  icon: typeof Mail
  tint: InsightTint
  title: string
  subtitle: string
}[] = [
  {
    icon: Mail,
    tint: "attention",
    title: "3 emails need your reply",
    subtitle: "Priya and LankaHost and 1 other",
  },
  {
    icon: Calendar,
    tint: "schedule",
    title: "Design sync at 9:30 AM",
    subtitle: "4 things today",
  },
  {
    icon: FileText,
    tint: "neutral",
    title: "3 notes saved",
    subtitle: "Kavindu's birthday ideas, Grocery list",
  },
]

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-10 px-4 pt-8 pb-32 sm:px-6">
        <AppHeader name="Amaya" avatarInitial="A" />

        <div className="flex flex-col items-center gap-4">
          <VoiceOrb />
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
            />
          ))}
        </div>
      </main>

      <AppFooter active="home" unreadCount={3} />
    </div>
  )
}
