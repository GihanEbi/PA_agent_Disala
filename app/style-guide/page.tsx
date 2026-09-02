import type { ReactNode } from "react"
import {
  Mic,
  Mail,
  Calendar,
  FileText,
  Plus,
  Keyboard,
  Send,
  ChevronRight,
  Target,
  Minus,
  AudioLines,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Icon } from "@/components/disala/icon"
import { StatusDot } from "@/components/disala/status-dot"
import { ProgressBar } from "@/components/disala/progress-bar"
import { EmailCard } from "@/components/disala/email-card"
import { EventCard } from "@/components/disala/event-card"
import { NoteCard } from "@/components/disala/note-card"
import { VoiceResponseCard } from "@/components/disala/voice-response-card"
import { BottomNav } from "@/components/disala/bottom-nav"
import { VoiceStateChip } from "@/components/disala/voice-state-chip"

function Panel({
  index,
  title,
  className,
  children,
}: {
  index: string
  title: string
  className?: string
  children: ReactNode
}) {
  return (
    <section
      className={`flex flex-col gap-6 rounded-lg bg-card p-6 sm:p-8 ${className ?? ""}`}
    >
      <h2 className="text-sm font-bold text-neutral-300">
        <span className="text-gold-400">{index}</span> {title}
      </h2>
      {children}
    </section>
  )
}

function Swatch({ name, hex }: { name: string; hex: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="h-20 w-full rounded-sm"
        style={{ backgroundColor: hex }}
      />
      <p className="text-sm font-bold text-foreground">{name}</p>
      <p className="text-sm text-neutral-500">{hex}</p>
    </div>
  )
}

const GOLD = [
  ["Gold 500", "#E7A94C"],
  ["Gold 400", "#ECBB6B"],
  ["Gold 300", "#F0CD8D"],
  ["Gold 200", "#F6DFB4"],
  ["Gold 100", "#FBF0DC"],
]
const TEAL = [
  ["Teal 500", "#4FB8AE"],
  ["Teal 400", "#6FC5BC"],
  ["Teal 300", "#8FD3CB"],
  ["Teal 200", "#B5E2DC"],
  ["Teal 100", "#DBF1EE"],
]
const NEUTRAL = [
  ["Neutral 900", "#0D1117"],
  ["Neutral 800", "#161C25"],
  ["Neutral 700", "#1E2631"],
  ["Neutral 500", "#5B6472"],
  ["Neutral 300", "#8D95A3"],
  ["Warm white", "#F3EFE7"],
]

const TYPE_SCALE = [
  { style: "Display 1", font: "Fraunces", size: "24 / 29", weight: "Medium", use: "Greeting header" },
  { style: "Display 2", font: "Fraunces", size: "18 / 23", weight: "Medium", use: "Section headings" },
  { style: "Display 3", font: "Fraunces", size: "17 / 26", weight: "Regular", use: "What the assistant says back" },
  { style: "Heading", font: "Manrope", size: "15 / 21", weight: "Semibold", use: "Primary list text" },
  { style: "Body", font: "Manrope", size: "14 / 20", weight: "Medium", use: "Secondary text" },
  { style: "Small", font: "Manrope", size: "13 / 18", weight: "Medium", use: "Captions, subtext" },
  { style: "Micro", font: "Manrope", size: "11.5 / 14", weight: "Bold", use: "Tags, timestamps, nav labels" },
]

const SPACING = [4, 8, 12, 16, 24, 32, 40, 48, 64]
const RADIUS = [
  ["8 — xs", "rounded-xs"],
  ["12 — sm", "rounded-sm"],
  ["18 — md", "rounded-md"],
  ["28 — lg", "rounded-lg"],
  ["Full", "rounded-full"],
]

const ICONS = [Mic, Mail, Calendar, FileText, Plus, Keyboard, Send, ChevronRight]

const PRINCIPLES = [
  {
    icon: Mic,
    title: "Voice first, always",
    body: "Every screen assumes talking is the primary path. Typing is one tap away, never required.",
  },
  {
    icon: Target,
    title: "One accent, one meaning",
    body: "Gold is action, teal is time, green is done. Color never decorates, it only informs.",
  },
  {
    icon: Minus,
    title: "Quiet by default",
    body: "No shadow on every row, no label above every heading, no filler copy. Silence is a feature.",
  },
  {
    icon: AudioLines,
    title: "Calm under motion",
    body: "Animation only confirms what changed. Nothing moves just to look alive.",
  },
]

export default function StyleGuidePage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-bold text-gold-400">Disala</p>
        <h1 className="font-display text-2xl font-medium text-foreground">
          Design system
        </h1>
        <p className="max-w-xl text-sm text-neutral-300">
          A unified visual language for Disala&apos;s voice-first assistant.
          Calm, warm, and built so the interface never competes with the
          conversation.
        </p>
      </header>

      <Panel index="01" title="Colors">
        <div className="flex flex-col gap-6">
          <div>
            <p className="mb-3 text-sm font-bold text-foreground">
              Primary — gold, voice &amp; action
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              {GOLD.map(([name, hex]) => (
                <Swatch key={name} name={name} hex={hex} />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-3 text-sm font-bold text-foreground">
              Secondary — teal, time &amp; schedule
            </p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              {TEAL.map(([name, hex]) => (
                <Swatch key={name} name={name} hex={hex} />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-3 text-sm font-bold text-foreground">Neutral</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-6">
              {NEUTRAL.map(([name, hex]) => (
                <Swatch key={name} name={name} hex={hex} />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-3 text-sm font-bold text-foreground">Semantic</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <Swatch name="Success" hex="#6FCF97" />
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel index="02" title="Typography">
          <div className="flex flex-col divide-y divide-border">
            <div className="flex items-center gap-4 pb-4">
              <span className="font-display text-4xl text-foreground">Ag</span>
              <div>
                <p className="font-semibold text-foreground">Fraunces</p>
                <p className="text-sm text-neutral-500">
                  Warm · literary · a little quirky
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 pt-4">
              <span className="text-4xl font-bold text-foreground">Ag</span>
              <div>
                <p className="font-semibold text-foreground">Manrope</p>
                <p className="text-sm text-neutral-500">
                  Clean · modern · highly legible
                </p>
              </div>
            </div>
          </div>
        </Panel>

        <Panel index="03" title="Type scale">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-collapse text-left text-sm">
              <thead>
                <tr className="text-neutral-500">
                  <th className="pb-3 pr-4 font-medium">Style</th>
                  <th className="pb-3 pr-4 font-medium">Font</th>
                  <th className="pb-3 pr-4 font-medium">Size / Line</th>
                  <th className="pb-3 pr-4 font-medium">Weight</th>
                  <th className="pb-3 font-medium">Use</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {TYPE_SCALE.map((row) => (
                  <tr key={row.style}>
                    <td className="py-3 pr-4 font-bold text-foreground">
                      {row.style}
                    </td>
                    <td className="py-3 pr-4 text-neutral-300">{row.font}</td>
                    <td className="py-3 pr-4 text-neutral-300">{row.size}</td>
                    <td className="py-3 pr-4 text-neutral-300">
                      {row.weight}
                    </td>
                    <td className="py-3 text-neutral-300">{row.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel index="04" title="Spacing system">
          <p className="text-sm text-neutral-300">
            Base unit 4px. Everything in the app — padding, gaps, row heights
            — is a multiple of it.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            {SPACING.map((px) => (
              <div key={px} className="flex flex-col items-center gap-2">
                <div
                  className="rounded-xs bg-neutral-700"
                  style={{ width: px, height: px }}
                />
                <span className="text-xs text-neutral-500">{px}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel index="05" title="Radius &amp; shadow">
          <div className="flex flex-wrap gap-6">
            {RADIUS.map(([label, cls]) => (
              <div key={label} className="flex flex-col items-center gap-2">
                <div className={`size-14 bg-neutral-700 ${cls}`} />
                <span className="text-xs text-neutral-500">{label}</span>
              </div>
            ))}
          </div>
          <div className="rounded-md bg-warm-white p-6">
            <p className="mb-4 text-sm text-neutral-700">
              Shown on light ground — Disala&apos;s shadows read against a
              warm surface, not against ink.
            </p>
            <div className="flex flex-wrap gap-6">
              {[
                { label: "Sm", cls: "shadow-sm" },
                { label: "Md", cls: "shadow-md" },
                { label: "Lg", cls: "shadow-lg" },
                { label: "Xl", cls: "shadow-xl" },
              ].map((shadow) => (
                <div
                  key={shadow.label}
                  className="flex flex-col items-center gap-2"
                >
                  <div
                    className={`h-16 w-20 rounded-sm bg-neutral-900 ${shadow.cls}`}
                  />
                  <span className="text-xs text-neutral-700">
                    {shadow.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.6fr_1fr]">
        <Panel index="06" title="Icons">
          <div className="grid grid-cols-4 gap-3">
            {ICONS.map((IconComponent, i) => (
              <div
                key={i}
                className="flex size-11 items-center justify-center rounded-sm bg-neutral-700 text-foreground"
              >
                <Icon icon={IconComponent} />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-3 divide-y divide-border text-sm">
            <p className="pb-3 text-neutral-300">
              <span className="font-bold text-foreground">24×24 grid,</span>{" "}
              1.6px stroke
            </p>
            <p className="py-3 text-neutral-300">
              <span className="font-bold text-foreground">Outline only</span>{" "}
              — no filled state, keeps the interface quiet
            </p>
            <p className="pt-3 text-neutral-300">
              <span className="font-bold text-foreground">Rounded</span> caps
              and joins throughout
            </p>
          </div>
        </Panel>

        <Panel index="07" title="Buttons">
          <div className="overflow-x-auto text-sm">
            <div className="grid min-w-[420px] grid-cols-[64px_repeat(4,1fr)] items-center gap-x-3 gap-y-4">
              <span />
              <span className="text-neutral-500">Primary</span>
              <span className="text-neutral-500">Secondary</span>
              <span className="text-neutral-500">Tertiary</span>
              <span className="text-neutral-500">Text</span>

              <span className="text-neutral-500">Default</span>
              <Button variant="primary" className="px-4">
                Talk to Disala
              </Button>
              <Button variant="secondary" className="px-4">
                View details
              </Button>
              <Button variant="tertiary" className="px-4">
                Open mail
              </Button>
              <Button variant="text">Ask Disala</Button>

              <span className="text-neutral-500">Disabled</span>
              <Button variant="primary" className="px-4" disabled>
                Talk to Disala
              </Button>
              <Button variant="secondary" className="px-4" disabled>
                View details
              </Button>
              <Button variant="tertiary" className="px-4" disabled>
                Open mail
              </Button>
              <Button variant="text" disabled>
                Ask Disala
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-3 divide-y divide-border text-sm">
            <p className="pb-3 text-neutral-300">
              <span className="font-bold text-foreground">Height</span> 44px
              default
            </p>
            <p className="py-3 text-neutral-300">
              <span className="font-bold text-foreground">Radius</span> full —
              pill, matches the orb&apos;s language
            </p>
            <p className="pt-3 text-neutral-300">
              <span className="font-bold text-foreground">Font</span> Manrope
              Bold, 13–14px
            </p>
          </div>
        </Panel>

        <Panel index="08" title="Inputs">
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 text-sm text-neutral-300">Type instead</p>
              <div className="relative">
                <Input placeholder="Ask Disala anything…" className="pr-11" />
                <span className="absolute top-1/2 right-4 -translate-y-1/2 text-neutral-300">
                  <Icon icon={Mic} size={18} />
                </span>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm text-neutral-300">Select</p>
              <Select defaultValue="recent">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Most recent</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-3 divide-y divide-border text-sm">
            <p className="pb-3 text-neutral-300">
              <span className="font-bold text-foreground">Height</span> 44px
            </p>
            <p className="py-3 text-neutral-300">
              <span className="font-bold text-foreground">Radius</span> 20px
            </p>
            <p className="pt-3 text-neutral-300">
              <span className="font-bold text-foreground">Focus</span> 2px
              gold outline
            </p>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel index="09" title="Badges &amp; tags">
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col items-start gap-2">
              <Badge variant="attention">Needs reply</Badge>
              <span className="text-xs text-neutral-500">Attention</span>
            </div>
            <div className="flex flex-col items-start gap-2">
              <Badge variant="resolved">Replied</Badge>
              <span className="text-xs text-neutral-500">Resolved</span>
            </div>
            <div className="flex flex-col items-start gap-2">
              <Badge variant="schedule">Up next</Badge>
              <span className="text-xs text-neutral-500">Schedule</span>
            </div>
          </div>
        </Panel>

        <Panel index="10" title="Status">
          <div className="flex flex-col gap-3">
            <StatusDot variant="listening" />
            <StatusDot variant="speaking" />
            <StatusDot variant="saved" />
            <StatusDot variant="muted" />
          </div>
        </Panel>

        <Panel index="11" title="Progress">
          <ProgressBar
            label="Syncing your inbox"
            percent={62}
            helperText="Runs quietly in the background whenever Disala reconnects to your accounts."
          />
        </Panel>
      </div>

      <Panel index="12" title="Cards">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-neutral-500">Email card</p>
            <EmailCard
              initials="PF"
              time="8:41 AM"
              sender="Priya Fernando"
              subject="Q3 budget review"
              preview="Can we go over the marketing line items before Thursday."
              status="Needs reply"
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-neutral-500">Event card</p>
            <EventCard
              time="9:30 AM"
              title="Design sync"
              attendees="Priya Fernando, Zoom"
              upNext
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-neutral-500">Note card</p>
            <NoteCard
              title="Grocery list"
              timestamp="Yesterday, 6:03 PM"
              preview="Rice, coconut, king fish, curry leaves, lime."
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-neutral-500">Voice response card</p>
            <VoiceResponseCard
              heading="3 emails need a reply"
              subtext="Priya, LankaHost and 1 other"
            />
          </div>
        </div>
      </Panel>

      <Panel index="13" title="Navigation">
        <BottomNav active="home" unreadCount={3} className="self-start" />
        <VoiceStateChip label="Listening" className="max-w-sm" />
        <p className="max-w-2xl text-sm text-neutral-300">
          Flat by design — four tabs, no nested pages, so there&apos;s no
          breadcrumb or pagination pattern to define. The voice sheet&apos;s
          state label and close icon are the only other navigational moment
          in the app.
        </p>
      </Panel>

      <Panel index="14" title="Principles">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PRINCIPLES.map((principle) => (
            <div key={principle.title} className="flex flex-col gap-3">
              <div className="flex size-11 items-center justify-center rounded-sm bg-neutral-700 text-gold-400">
                <Icon icon={principle.icon} />
              </div>
              <p className="font-bold text-foreground">{principle.title}</p>
              <p className="text-sm text-neutral-300">{principle.body}</p>
            </div>
          ))}
        </div>
      </Panel>
    </main>
  )
}
