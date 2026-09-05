"use client"

import { useState, useTransition } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { approveApprovalAction, rejectApprovalAction } from "@/app/actions/approvals"
import { formatNoteTimestamp } from "@/lib/format-timestamp"

type ApprovalData = {
  id: string
  actionType: string
  title: string
  description: string
  status: string
  payload: unknown
  result: unknown
  createdAt: string
  expiresAt: string | null
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  EMAIL_SEND: "Email · Send",
  CALENDAR_CREATE: "Calendar · Create",
  CALENDAR_UPDATE: "Calendar · Update",
  CALENDAR_CANCEL: "Calendar · Cancel",
  NOTE_CREATE: "Notes · Create",
  NOTE_UPDATE: "Notes · Update",
  OTHER: "Other",
}

const EXECUTED_LABELS: Record<string, string> = {
  EMAIL_SEND: "Sent",
  CALENDAR_CREATE: "Created",
  CALENDAR_UPDATE: "Updated",
  CALENDAR_CANCEL: "Cancelled",
}

function StatusBadge({ status, actionType }: { status: string; actionType: string }) {
  if (status === "EXECUTED") {
    return <Badge variant="resolved">{EXECUTED_LABELS[actionType] ?? "Done"}</Badge>
  }
  if (status === "FAILED") return <Badge variant="attention">Failed</Badge>
  if (status === "REJECTED") return <Badge variant="neutral">Rejected</Badge>
  if (status === "EXPIRED") return <Badge variant="neutral">Expired</Badge>
  return <Badge variant="schedule">Pending approval</Badge>
}

function formatEventTime(value: string | null | undefined) {
  if (!value) return ""
  return new Date(value).toLocaleString()
}

function EmailPayloadSummary({ payload }: { payload: unknown }) {
  if (!payload || typeof payload !== "object") return null
  const p = payload as { to?: string[]; cc?: string[]; subject?: string; bodyText?: string }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>
        <span className="font-bold text-neutral-300">To: </span>
        {p.to?.join(", ")}
      </p>
      {p.cc?.length ? (
        <p>
          <span className="font-bold text-neutral-300">Cc: </span>
          {p.cc.join(", ")}
        </p>
      ) : null}
      <p>
        <span className="font-bold text-neutral-300">Subject: </span>
        {p.subject}
      </p>
      <p className="whitespace-pre-wrap text-neutral-300">{p.bodyText}</p>
    </div>
  )
}

function EventPayloadSummary({ payload }: { payload: unknown }) {
  if (!payload || typeof payload !== "object") return null
  const p = payload as {
    summary?: string
    description?: string
    start?: { dateTime?: string }
    end?: { dateTime?: string }
    attendees?: { email: string }[]
  }

  return (
    <div className="flex flex-col gap-1 text-sm">
      <p className="font-semibold text-foreground">{p.summary}</p>
      <p className="text-neutral-300">
        {p.start?.dateTime ? new Date(p.start.dateTime).toLocaleString() : ""}
        {" – "}
        {p.end?.dateTime ? new Date(p.end.dateTime).toLocaleString() : ""}
      </p>
      {p.attendees?.length ? (
        <p>
          <span className="font-bold text-neutral-300">Attendees: </span>
          {p.attendees.map((attendee) => attendee.email).join(", ")}
        </p>
      ) : null}
      {p.description ? <p className="text-neutral-300">{p.description}</p> : null}
    </div>
  )
}

type EventSnapshotShape = {
  summary?: string
  description?: string
  start?: string | null
  end?: string | null
  attendees?: { email: string }[]
}

type EventChangesShape = {
  summary?: string
  description?: string
  start?: string
  end?: string
  attendees?: { email: string }[]
}

function UpdatePayloadSummary({ payload }: { payload: unknown }) {
  if (!payload || typeof payload !== "object") return null
  const p = payload as {
    changes?: EventChangesShape
    snapshot?: EventSnapshotShape
    sendUpdates?: string
  }
  const snapshot = p.snapshot
  const changes = p.changes ?? {}
  const attendeeCount = snapshot?.attendees?.length ?? 0

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div>
        <p className="text-xs font-bold text-neutral-500">Current</p>
        <p className="font-semibold text-foreground">{snapshot?.summary}</p>
        <p className="text-neutral-300">
          {formatEventTime(snapshot?.start)} – {formatEventTime(snapshot?.end)}
        </p>
      </div>
      <div>
        <p className="text-xs font-bold text-neutral-500">Changing to</p>
        <div className="flex flex-col gap-0.5 text-neutral-300">
          {changes.summary !== undefined ? (
            <p>
              <span className="font-bold">Title: </span>
              {changes.summary}
            </p>
          ) : null}
          {changes.start !== undefined ? (
            <p>
              <span className="font-bold">Time: </span>
              {formatEventTime(changes.start)} – {formatEventTime(changes.end)}
            </p>
          ) : null}
          {changes.description !== undefined ? (
            <p>
              <span className="font-bold">Description: </span>
              {changes.description}
            </p>
          ) : null}
          {changes.attendees !== undefined ? (
            <p>
              <span className="font-bold">Attendees (replaces the current list): </span>
              {changes.attendees.map((attendee) => attendee.email).join(", ")}
            </p>
          ) : null}
        </div>
      </div>
      {attendeeCount > 0 ? (
        <p className="text-neutral-300">
          {p.sendUpdates === "none"
            ? `The ${attendeeCount} ${attendeeCount === 1 ? "person" : "people"} invited will not be notified of this change.`
            : `The ${attendeeCount} ${attendeeCount === 1 ? "person" : "people"} invited will be notified of this change.`}
        </p>
      ) : null}
    </div>
  )
}

function CancelPayloadSummary({ payload }: { payload: unknown }) {
  if (!payload || typeof payload !== "object") return null
  const p = payload as { snapshot?: EventSnapshotShape; sendUpdates?: string }
  const snapshot = p.snapshot
  const attendeeCount = snapshot?.attendees?.length ?? 0

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div>
        <p className="font-semibold text-foreground">{snapshot?.summary}</p>
        <p className="text-neutral-300">
          {formatEventTime(snapshot?.start)} – {formatEventTime(snapshot?.end)}
        </p>
        {snapshot?.attendees?.length ? (
          <p>
            <span className="font-bold text-neutral-300">Attendees: </span>
            {snapshot.attendees.map((attendee) => attendee.email).join(", ")}
          </p>
        ) : null}
      </div>
      <p className="text-neutral-300">
        This deletes the event from your Google Calendar.
        {attendeeCount > 0
          ? p.sendUpdates === "none"
            ? ` The ${attendeeCount} ${attendeeCount === 1 ? "person" : "people"} invited will not be notified.`
            : ` The ${attendeeCount} ${attendeeCount === 1 ? "person" : "people"} invited will be notified that it's cancelled.`
          : ""}
      </p>
    </div>
  )
}

function PayloadSummary({ actionType, payload }: { actionType: string; payload: unknown }) {
  if (actionType === "EMAIL_SEND") return <EmailPayloadSummary payload={payload} />
  if (actionType === "CALENDAR_CREATE") return <EventPayloadSummary payload={payload} />
  if (actionType === "CALENDAR_UPDATE") return <UpdatePayloadSummary payload={payload} />
  if (actionType === "CALENDAR_CANCEL") return <CancelPayloadSummary payload={payload} />
  return null
}

function getResultErrorMessage(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined
  const withError = result as { error?: { message?: string } }
  return withError.error?.message
}

function ApprovalCard({
  approval: initialApproval,
  variant = "chat",
}: {
  approval: ApprovalData
  variant?: "chat" | "list"
}) {
  const [approval, setApproval] = useState(initialApproval)
  const [error, setError] = useState<string | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleApprove() {
    setError(null)
    startTransition(async () => {
      const outcome = await approveApprovalAction(approval.id)
      if (outcome.approval) setApproval(outcome.approval as unknown as ApprovalData)
      if (!outcome.ok && "reason" in outcome) {
        setError(
          outcome.reason === "expired"
            ? "This request expired — ask Disala again if you'd still like to do this."
            : outcome.reason === "already_resolved"
              ? "This was already resolved."
              : "Couldn't find that approval."
        )
      }
      setConfirmingCancel(false)
    })
  }

  function handleReject() {
    setError(null)
    startTransition(async () => {
      const outcome = await rejectApprovalAction(approval.id)
      if (outcome.approval) setApproval(outcome.approval as unknown as ApprovalData)
      setConfirmingCancel(false)
    })
  }

  // A PENDING row past its expiresAt is shown as expired here without
  // mutating the database — a GET/render must not have side effects. The
  // actual flip to EXPIRED happens the next time approveApproval touches it.
  // `now` is captured once via a lazy initializer rather than calling
  // Date.now() directly in the render body (React's purity rule).
  const [now] = useState(() => Date.now())
  const isPastExpiry = approval.expiresAt
    ? new Date(approval.expiresAt).getTime() < now
    : false
  const displayStatus = approval.status === "PENDING" && isPastExpiry ? "EXPIRED" : approval.status
  const isActionable = displayStatus === "PENDING"
  const isCancel = approval.actionType === "CALENDAR_CANCEL"
  const resultErrorMessage = approval.status === "FAILED" ? getResultErrorMessage(approval.result) : undefined

  return (
    <div className="flex flex-col gap-3 rounded-md bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <p className="font-display text-base font-medium text-foreground">{approval.title}</p>
          <p className="text-sm text-neutral-300">{approval.description}</p>
          {variant === "list" ? (
            <p className="text-xs font-bold text-neutral-500">
              {ACTION_TYPE_LABELS[approval.actionType] ?? approval.actionType} ·{" "}
              {formatNoteTimestamp(new Date(approval.createdAt))}
            </p>
          ) : null}
        </div>
        <StatusBadge status={displayStatus} actionType={approval.actionType} />
      </div>

      <PayloadSummary actionType={approval.actionType} payload={approval.payload} />

      {resultErrorMessage ? <p className="text-sm text-red-400">{resultErrorMessage}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {isActionable ? (
        isCancel && confirmingCancel ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-foreground">
              Cancel this meeting? This can&apos;t be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="primary" onClick={handleApprove} disabled={isPending}>
                Yes, cancel this meeting
              </Button>
              <Button
                variant="secondary"
                onClick={() => setConfirmingCancel(false)}
                disabled={isPending}
              >
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-3">
            <Button
              variant="primary"
              onClick={isCancel ? () => setConfirmingCancel(true) : handleApprove}
              disabled={isPending}
            >
              Approve
            </Button>
            <Button variant="secondary" onClick={handleReject} disabled={isPending}>
              Reject
            </Button>
          </div>
        )
      ) : null}

      {variant === "list" ? (
        <details className="text-sm">
          <summary className="cursor-pointer font-bold text-teal-500">Details</summary>
          <div className="mt-2 flex flex-col gap-1 text-neutral-300">
            <p>
              <span className="font-bold text-neutral-500">Created: </span>
              {new Date(approval.createdAt).toLocaleString()}
            </p>
            <p>
              <span className="font-bold text-neutral-500">Expires: </span>
              {approval.expiresAt ? new Date(approval.expiresAt).toLocaleString() : "Never"}
            </p>
            <p>
              <span className="font-bold text-neutral-500">Status: </span>
              {displayStatus}
            </p>
            {approval.result ? (
              <p className="whitespace-pre-wrap">
                <span className="font-bold text-neutral-500">Result: </span>
                {JSON.stringify(approval.result)}
              </p>
            ) : null}
          </div>
        </details>
      ) : null}
    </div>
  )
}

export { ApprovalCard, type ApprovalData }
