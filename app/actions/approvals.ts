"use server"

import { auth } from "@clerk/nextjs/server"

import { getOrCreateInternalUser } from "@/lib/get-or-create-user"
import { approveApproval, rejectApproval } from "@/lib/approvals"

async function resolveCallingUserId() {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) throw new Error("Not signed in")

  const internalUser = await getOrCreateInternalUser()
  if (!internalUser) throw new Error("Not signed in")

  return internalUser.id
}

async function approveApprovalAction(approvalId: string) {
  const userId = await resolveCallingUserId()
  return approveApproval(userId, approvalId)
}

async function rejectApprovalAction(approvalId: string) {
  const userId = await resolveCallingUserId()
  return rejectApproval(userId, approvalId)
}

export { approveApprovalAction, rejectApprovalAction }
