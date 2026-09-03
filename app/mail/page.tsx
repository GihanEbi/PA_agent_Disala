import { getHeaderIdentity } from "@/lib/disala-user"
import { AppHeader } from "@/components/disala/app-header"
import { AppFooter } from "@/components/disala/app-footer"
import { SectionHeader } from "@/components/disala/section-header"
import { EmailCard } from "@/components/disala/email-card"

const EMAILS: {
  initials: string
  sender: string
  subject: string
  preview: string
  time: string
  needsReply: boolean
}[] = [
  {
    initials: "PF",
    sender: "Priya Fernando",
    subject: "Q3 budget review",
    preview: "Can we go over the marketing line items before Thursday.",
    time: "8:41 AM",
    needsReply: true,
  },
  {
    initials: "LH",
    sender: "LankaHost Billing",
    subject: "Invoice #2291 is due",
    preview: "Your hosting invoice for August is ready to view in your billing portal.",
    time: "7:15 AM",
    needsReply: true,
  },
  {
    initials: "DW",
    sender: "Design Weekly",
    subject: "5 layouts worth stealing this week",
    preview: "This week: quiet dashboards, one bold headline, and a lot of restraint.",
    time: "Yesterday",
    needsReply: false,
  },
  {
    initials: "KP",
    sender: "Kavindu Perera",
    subject: "Dinner Friday?",
    preview: "Thinking that new place near the lagoon, maybe 7ish?",
    time: "Yesterday",
    needsReply: true,
  },
]

export default async function MailPage() {
  const { name, avatarInitial, online } = await getHeaderIdentity()

  return (
    <div className="relative flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 pt-8 pb-32 sm:px-6">
        <AppHeader name={name} avatarInitial={avatarInitial} online={online} />

        <div className="flex flex-col gap-2">
          <SectionHeader title="Inbox" meta="3 need a reply" />
          <div className="flex flex-col">
            {EMAILS.map((email) => (
              <EmailCard
                key={email.subject}
                variant="flat"
                initials={email.initials}
                sender={email.sender}
                subject={email.subject}
                preview={email.preview}
                time={email.time}
                status={email.needsReply ? "Needs reply" : undefined}
                replyLabel={email.needsReply ? "Ask Disala to reply" : undefined}
              />
            ))}
          </div>
        </div>
      </main>

      <AppFooter active="mail" unreadCount={3} />
    </div>
  )
}
