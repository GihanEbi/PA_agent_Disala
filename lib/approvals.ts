import "server-only"

import { db } from "@/lib/db"
import { ApprovalActionType, ApprovalStatus } from "@/lib/generated/prisma/enums"
import type { Prisma } from "@/lib/generated/prisma/client"
import { sendEmail } from "@/lib/integrations/gmail"
import { createEvent, updateEvent, cancelEvent } from "@/lib/integrations/calendar"

const APPROVAL_TTL_MS = 24 * 60 * 60 * 1000

async function createApproval({
  userId,
  conversationId,
  actionType,
  title,
  description,
  payload,
}: {
  userId: string
  conversationId?: string
  actionType: ApprovalActionType
  title: string
  description: string
  payload: Prisma.InputJsonValue
}) {
  return db.approval.create({
    data: {
      userId,
      conversationId,
      actionType,
      title,
      description,
      payload,
      expiresAt: new Date(Date.now() + APPROVAL_TTL_MS),
    },
  })
}

async function getApproval(userId: string, approvalId: string) {
  return db.approval.findFirst({ where: { id: approvalId, userId } })
}

/**
 * Only code path in the project that can call sendEmail/createEvent — see
 * disala-07 security considerations. Runs only after approveApproval's
 * atomic claim has succeeded, so it executes at most once per row.
 */
async function executeApproval(approval: {
  id: string
  userId: string
  actionType: ApprovalActionType
  payload: unknown
}) {
  if (approval.actionType === ApprovalActionType.EMAIL_SEND) {
    const result = await sendEmail(approval.userId, approval.payload)
    await db.approval.update({
      where: { id: approval.id },
      data: {
        status: result.ok ? ApprovalStatus.EXECUTED : ApprovalStatus.FAILED,
        executedAt: new Date(),
        result: (result.ok ? { messageId: result.data.id } : { error: result.error }) as Prisma.InputJsonValue,
      },
    })
    return result
  }

  if (approval.actionType === ApprovalActionType.CALENDAR_CREATE) {
    const result = await createEvent(approval.userId, approval.payload)
    await db.approval.update({
      where: { id: approval.id },
      data: {
        status: result.ok ? ApprovalStatus.EXECUTED : ApprovalStatus.FAILED,
        executedAt: new Date(),
        result: (result.ok
          ? { eventId: result.data.id, htmlLink: result.data.htmlLink }
          : { error: result.error }) as Prisma.InputJsonValue,
      },
    })
    return result
  }

  if (approval.actionType === ApprovalActionType.CALENDAR_UPDATE) {
    const result = await updateEvent(approval.userId, approval.payload)
    await db.approval.update({
      where: { id: approval.id },
      data: {
        status: result.ok ? ApprovalStatus.EXECUTED : ApprovalStatus.FAILED,
        executedAt: new Date(),
        result: (result.ok
          ? { eventId: result.data.eventId, htmlLink: result.data.htmlLink }
          : { error: result.error }) as Prisma.InputJsonValue,
      },
    })
    return result
  }

  if (approval.actionType === ApprovalActionType.CALENDAR_CANCEL) {
    const result = await cancelEvent(approval.userId, approval.payload)
    await db.approval.update({
      where: { id: approval.id },
      data: {
        status: result.ok ? ApprovalStatus.EXECUTED : ApprovalStatus.FAILED,
        executedAt: new Date(),
        result: (result.ok
          ? { eventId: result.data.eventId, cancelled: true }
          : { error: result.error }) as Prisma.InputJsonValue,
      },
    })
    return result
  }

  // No tool in this project can create an Approval with any other
  // actionType (see disala-07's Approval requirements) — if one somehow
  // existed, this is a documented no-op, not a silent wrong action.
  const error = {
    code: "PROVIDER_ERROR" as const,
    message: `No execution path for ${approval.actionType}`,
  }
  await db.approval.update({
    where: { id: approval.id },
    data: {
      status: ApprovalStatus.FAILED,
      executedAt: new Date(),
      result: { error } as Prisma.InputJsonValue,
    },
  })
  return { ok: false as const, error }
}

type ApproveOutcome =
  | { ok: true; approval: NonNullable<Awaited<ReturnType<typeof getApproval>>> }
  | {
      ok: false
      reason: "not_found" | "already_resolved" | "expired"
      approval?: Awaited<ReturnType<typeof getApproval>>
    }

/**
 * Atomic claim-then-call: only the request that flips PENDING → APPROVED
 * is allowed to execute — this is the entire idempotency guarantee against
 * a double-click or a retried request (disala-07 decision #10).
 */
async function approveApproval(userId: string, approvalId: string): Promise<ApproveOutcome> {
  const now = new Date()
  const existing = await getApproval(userId, approvalId)
  if (!existing) return { ok: false, reason: "not_found" }

  if (existing.status === ApprovalStatus.PENDING && existing.expiresAt && existing.expiresAt.getTime() < now.getTime()) {
    await db.approval.updateMany({
      where: { id: approvalId, userId, status: ApprovalStatus.PENDING },
      data: { status: ApprovalStatus.EXPIRED },
    })
  }

  const { count } = await db.approval.updateMany({
    where: {
      id: approvalId,
      userId,
      status: ApprovalStatus.PENDING,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    data: { status: ApprovalStatus.APPROVED, approvedAt: now },
  })

  if (count === 0) {
    const current = await getApproval(userId, approvalId)
    return {
      ok: false,
      reason: current?.status === ApprovalStatus.EXPIRED ? "expired" : "already_resolved",
      approval: current ?? existing,
    }
  }

  const claimed = await getApproval(userId, approvalId)
  if (!claimed) return { ok: false, reason: "not_found" }

  await executeApproval(claimed)

  const final = await getApproval(userId, approvalId)
  return { ok: true, approval: final ?? claimed }
}

async function rejectApproval(userId: string, approvalId: string) {
  const { count } = await db.approval.updateMany({
    where: { id: approvalId, userId, status: ApprovalStatus.PENDING },
    data: { status: ApprovalStatus.REJECTED, rejectedAt: new Date() },
  })

  const approval = await getApproval(userId, approvalId)
  if (count === 0) {
    return { ok: false as const, approval }
  }
  return { ok: true as const, approval }
}

const APPROVALS_SERVICES = {
  Email: [ApprovalActionType.EMAIL_SEND],
  Calendar: [ApprovalActionType.CALENDAR_CREATE, ApprovalActionType.CALENDAR_UPDATE, ApprovalActionType.CALENDAR_CANCEL],
  Notes: [ApprovalActionType.NOTE_CREATE, ApprovalActionType.NOTE_UPDATE],
  Other: [ApprovalActionType.OTHER],
} as const

type ApprovalService = keyof typeof APPROVALS_SERVICES

const APPROVALS_LIST_CAP = 200

/**
 * `status`/`service`/`since` are trusted, already-whitelisted values — the
 * caller (app/approvals/page.tsx) is responsible for validating raw
 * searchParams against a fixed set before they ever reach here. `userId`
 * is not itself a filter a caller can widen: it's always the first clause.
 */
async function listApprovals({
  userId,
  status,
  service,
  since,
}: {
  userId: string
  status?: ApprovalStatus
  service?: ApprovalService
  since?: Date
}) {
  return db.approval.findMany({
    where: {
      userId,
      ...(status ? { status } : {}),
      ...(service ? { actionType: { in: [...APPROVALS_SERVICES[service]] } } : {}),
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: APPROVALS_LIST_CAP,
  })
}

export {
  createApproval,
  getApproval,
  approveApproval,
  rejectApproval,
  listApprovals,
  APPROVALS_SERVICES,
  type ApprovalService,
}
