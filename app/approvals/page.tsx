import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { z } from "zod"

import { getHeaderIdentity } from "@/lib/disala-user"
import { getOrCreateInternalUser } from "@/lib/get-or-create-user"
import { listApprovals, APPROVALS_SERVICES, type ApprovalService } from "@/lib/approvals"
import { ApprovalStatus } from "@/lib/generated/prisma/enums"
import { AppHeader } from "@/components/disala/app-header"
import { SectionHeader } from "@/components/disala/section-header"
import { ApprovalCard, type ApprovalData } from "@/components/disala/approval-card"
import { ApprovalFilters } from "@/components/disala/approval-filters"

type DateRange = "today" | "7d" | "all"

const STATUS_VALUES = Object.values(ApprovalStatus) as [ApprovalStatus, ...ApprovalStatus[]]
const SERVICE_VALUES = Object.keys(APPROVALS_SERVICES) as [ApprovalService, ...ApprovalService[]]
const statusSchema = z.enum(STATUS_VALUES)
const serviceSchema = z.enum(SERVICE_VALUES)

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function getSinceDate(range: DateRange): Date | undefined {
  if (range === "all") return undefined
  const now = new Date()
  if (range === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(now.getDate() - 7)
  return sevenDaysAgo
}

function toApprovalData(approval: {
  id: string
  actionType: string
  title: string
  description: string
  status: string
  payload: unknown
  result: unknown
  createdAt: Date
  expiresAt: Date | null
}): ApprovalData {
  return {
    id: approval.id,
    actionType: approval.actionType,
    title: approval.title,
    description: approval.description,
    status: approval.status,
    payload: approval.payload,
    result: approval.result,
    createdAt: approval.createdAt.toISOString(),
    expiresAt: approval.expiresAt ? approval.expiresAt.toISOString() : null,
  }
}

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) redirect("/sign-in")

  const internalUser = await getOrCreateInternalUser()
  if (!internalUser) redirect("/sign-in")

  const params = await searchParams
  const statusResult = statusSchema.safeParse(firstValue(params.status))
  const serviceResult = serviceSchema.safeParse(firstValue(params.service))
  const rawDate = firstValue(params.date)
  const dateRange: DateRange = rawDate === "7d" ? "7d" : rawDate === "all" ? "all" : "today"

  const status = statusResult.success ? statusResult.data : undefined
  const service = serviceResult.success ? serviceResult.data : undefined

  const [{ name, avatarInitial, online }, approvals] = await Promise.all([
    getHeaderIdentity(),
    listApprovals({
      userId: internalUser.id,
      status,
      service,
      since: getSinceDate(dateRange),
    }),
  ])

  const activeFilters = [
    status ? status.toLowerCase() : null,
    service ?? null,
    dateRange !== "today" ? (dateRange === "7d" ? "the last 7 days" : "all time") : null,
  ].filter((filter): filter is string => !!filter)

  return (
    <div className="relative flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-8 pb-8 sm:px-6">
        <AppHeader name={name} avatarInitial={avatarInitial} online={online} />

        <div className="flex flex-col gap-4">
          <SectionHeader title="Approvals" meta={`${approvals.length} shown`} />

          <ApprovalFilters
            status={status ?? "ALL"}
            service={service ?? "ALL"}
            date={dateRange}
          />

          {approvals.length === 0 ? (
            <p className="text-sm text-neutral-300">
              No approvals{dateRange === "today" ? " today" : ""}
              {activeFilters.length > 0 ? ` for ${activeFilters.join(", ")}` : ""}.
              {dateRange === "today" ? " Try “Last 7 days” or “All time”." : ""}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {approvals.map((approval) => (
                <ApprovalCard key={approval.id} approval={toApprovalData(approval)} variant="list" />
              ))}
            </div>
          )}
        </div>

        <Link href="/" className="text-sm text-teal-500 underline-offset-4 hover:underline">
          ← Back to Disala
        </Link>
      </main>
    </div>
  )
}
