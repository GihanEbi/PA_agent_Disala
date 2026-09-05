"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const STATUS_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "EXECUTED", label: "Executed" },
  { value: "FAILED", label: "Failed" },
  { value: "REJECTED", label: "Rejected" },
  { value: "EXPIRED", label: "Expired" },
]

const SERVICE_OPTIONS = [
  { value: "ALL", label: "All services" },
  { value: "Email", label: "Email" },
  { value: "Calendar", label: "Calendar" },
  { value: "Notes", label: "Notes" },
  { value: "Other", label: "Other" },
]

const DATE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "all", label: "All time" },
]

/**
 * Filters are server-side and driven entirely by the URL (disala-08
 * decision #11) — this component only ever narrows what's already been
 * rendered by pushing a new searchParams string; it holds no filtered data
 * itself.
 */
function ApprovalFilters({
  status,
  service,
  date,
}: {
  status: string
  service: string
  date: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function updateParam(key: "status" | "service" | "date", value: string) {
    const next = new URLSearchParams(searchParams.toString())
    const isDefault = value === "ALL" || (key === "date" && value === "today")
    if (isDefault) {
      next.delete(key)
    } else {
      next.set(key, value)
    }
    router.replace(next.size > 0 ? `${pathname}?${next.toString()}` : pathname)
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <Select value={status} onValueChange={(value) => updateParam("status", String(value))}>
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={service} onValueChange={(value) => updateParam("service", String(value))}>
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SERVICE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={date} onValueChange={(value) => updateParam("date", String(value))}>
        <SelectTrigger size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DATE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export { ApprovalFilters }
