import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"

import { getHeaderIdentity } from "@/lib/disala-user"
import { getOrCreateInternalUser } from "@/lib/get-or-create-user"
import { searchEmails, getUnreadCount, type EmailSummary } from "@/lib/integrations/gmail"
import type { GoogleApiErrorCode } from "@/lib/integrations/google-client"
import { formatEmailTimestamp } from "@/lib/format-timestamp"
import { parseFromHeader, getInitials } from "@/lib/format-email"
import { AppHeader } from "@/components/disala/app-header"
import { AppFooter } from "@/components/disala/app-footer"
import { SectionHeader } from "@/components/disala/section-header"
import { EmailCard } from "@/components/disala/email-card"

const INBOX_PAGE_SIZE = 20
const BADGE_COUNT_CAP = 9

// BottomNav's badge is a fixed-size 16px circle sized for a single digit
// (it has only ever been passed the mock's hardcoded 3) — cap rather than
// resize the circle, since resizing it is a visual redesign with no
// reference to check it against.
function capBadgeCount(count: number) {
  return Math.min(count, BADGE_COUNT_CAP)
}

function connectionMessage(code: GoogleApiErrorCode) {
  if (code === "NOT_CONNECTED") {
    return "Connect your Google account to see your inbox here."
  }
  if (code === "NEEDS_REAUTH") {
    return "Your Google connection needs to be reconnected."
  }
  return "Couldn't load your inbox right now."
}

export default async function MailPage() {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) redirect("/sign-in")

  const internalUser = await getOrCreateInternalUser()
  if (!internalUser) redirect("/sign-in")

  const [{ name, avatarInitial, online }, emailsResult, unreadResult] = await Promise.all([
    getHeaderIdentity(),
    searchEmails(internalUser.id, { query: "in:inbox", maxResults: INBOX_PAGE_SIZE }),
    getUnreadCount(internalUser.id),
  ])

  const unreadCount = unreadResult.ok ? unreadResult.data : undefined
  const meta = unreadResult.ok ? `${unreadCount} unread` : "—"

  return (
    <div className="relative flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-4 pt-8 pb-32 sm:px-6">
        <AppHeader name={name} avatarInitial={avatarInitial} online={online} />

        <div className="flex flex-col gap-2">
          <SectionHeader title="Inbox" meta={meta} />

          {!emailsResult.ok ? (
            <div className="flex flex-col gap-3 rounded-md bg-card p-4 text-sm text-neutral-300">
              <p>{connectionMessage(emailsResult.error.code)}</p>
              {emailsResult.error.code === "NOT_CONNECTED" ||
              emailsResult.error.code === "NEEDS_REAUTH" ? (
                <Link
                  href="/settings/connections"
                  className="text-sm text-teal-500 underline-offset-4 hover:underline"
                >
                  Go to Connections →
                </Link>
              ) : null}
            </div>
          ) : emailsResult.data.length === 0 ? (
            <div className="rounded-md bg-card p-4 text-sm text-neutral-300">
              Your inbox is empty.
            </div>
          ) : (
            <div className="flex flex-col">
              {emailsResult.data.map((email: EmailSummary) => {
                const { name: senderName } = parseFromHeader(email.from)
                return (
                  <EmailCard
                    key={email.id}
                    variant="flat"
                    initials={getInitials(senderName)}
                    sender={senderName}
                    subject={email.subject || "(no subject)"}
                    preview={email.snippet}
                    time={formatEmailTimestamp(new Date(email.date))}
                    status={email.isUnread ? "Unread" : undefined}
                    replyLabel={email.isUnread ? "Ask Disala to reply" : undefined}
                  />
                )
              })}
            </div>
          )}
        </div>
      </main>

      <AppFooter
        active="mail"
        unreadCount={unreadCount !== undefined ? capBadgeCount(unreadCount) : undefined}
      />
    </div>
  )
}
