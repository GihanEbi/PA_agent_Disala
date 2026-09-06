import "server-only"
import { z } from "zod"

import {
  getAuthorizedGoogleClients,
  runGoogleApiCall,
  hasUsableGoogleConnection,
  type GoogleApiResult,
} from "@/lib/integrations/google-client"

const MAX_RESULTS_CAP = 50
const MAX_DURATION_MINUTES = 24 * 60

function invalidInput<T>(issueMessage: string | undefined): GoogleApiResult<T> {
  return { ok: false, error: { code: "INVALID_INPUT", message: issueMessage ?? "Invalid input" } }
}

const isoDateTime = z.string().refine((s) => !isNaN(Date.parse(s)), "must be a valid ISO 8601 date-time")

const ianaTimeZone = z.string().min(1).max(100).refine((tz) => {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}, "must be a valid IANA time zone")

// --- getEvents ---

const getEventsSchema = z.object({
  timeMin: isoDateTime,
  timeMax: isoDateTime,
  maxResults: z.number().int().positive().max(MAX_RESULTS_CAP).optional(),
})

type CalendarEvent = {
  id: string
  summary: string
  description: string
  start: string | null
  end: string | null
  attendees: { email: string; responseStatus?: string; displayName?: string }[]
  location: string
  htmlLink: string
  status: string
}

async function getEvents(userId: string, input: unknown): Promise<GoogleApiResult<CalendarEvent[]>> {
  const parsed = getEventsSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)

  const clients = await getAuthorizedGoogleClients(userId)
  if (!clients.ok) return clients

  const result = await runGoogleApiCall(userId, () =>
    clients.data.calendar.events.list({
      calendarId: "primary",
      timeMin: parsed.data.timeMin,
      timeMax: parsed.data.timeMax,
      maxResults: parsed.data.maxResults ?? 10,
      singleEvents: true,
      orderBy: "startTime",
    })
  )
  if (!result.ok) return result

  const events = (result.data.items ?? []).map((event) => ({
    id: event.id ?? "",
    summary: event.summary ?? "",
    description: event.description ?? "",
    start: event.start?.dateTime ?? event.start?.date ?? null,
    end: event.end?.dateTime ?? event.end?.date ?? null,
    attendees: (event.attendees ?? []).map((attendee) => ({
      email: attendee.email ?? "",
      responseStatus: attendee.responseStatus ?? undefined,
      displayName: attendee.displayName ?? undefined,
    })),
    location: event.location ?? "",
    htmlLink: event.htmlLink ?? "",
    status: event.status ?? "",
  }))

  return { ok: true, data: events }
}

// --- findAvailableTimes ---

const findAvailableTimesSchema = z.object({
  timeMin: isoDateTime,
  timeMax: isoDateTime,
  durationMinutes: z.number().int().positive().max(MAX_DURATION_MINUTES),
  calendarIds: z.array(z.string().min(1)).min(1).max(10).optional(),
})

type TimeRange = { start: string; end: string }

async function findAvailableTimes(
  userId: string,
  input: unknown
): Promise<GoogleApiResult<{ slots: TimeRange[]; busy: TimeRange[] }>> {
  const parsed = findAvailableTimesSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)

  const clients = await getAuthorizedGoogleClients(userId)
  if (!clients.ok) return clients

  const calendarIds = parsed.data.calendarIds ?? ["primary"]

  const result = await runGoogleApiCall(userId, () =>
    clients.data.calendar.freebusy.query({
      requestBody: {
        timeMin: parsed.data.timeMin,
        timeMax: parsed.data.timeMax,
        items: calendarIds.map((id) => ({ id })),
      },
    })
  )
  if (!result.ok) return result

  const busy: TimeRange[] = calendarIds
    .flatMap((id) => result.data.calendars?.[id]?.busy ?? [])
    .filter((period): period is { start: string; end: string } => !!period.start && !!period.end)
    .map((period) => ({ start: period.start, end: period.end }))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())

  const slots: TimeRange[] = []
  let cursor = new Date(parsed.data.timeMin)
  const rangeEnd = new Date(parsed.data.timeMax)
  const durationMs = parsed.data.durationMinutes * 60 * 1000

  for (const period of busy) {
    const busyStart = new Date(period.start)
    const busyEnd = new Date(period.end)
    if (busyStart.getTime() - cursor.getTime() >= durationMs) {
      slots.push({ start: cursor.toISOString(), end: busyStart.toISOString() })
    }
    if (busyEnd.getTime() > cursor.getTime()) {
      cursor = busyEnd
    }
  }
  if (rangeEnd.getTime() - cursor.getTime() >= durationMs) {
    slots.push({ start: cursor.toISOString(), end: rangeEnd.toISOString() })
  }

  return { ok: true, data: { slots, busy } }
}

// --- prepareEvent (no Calendar API call — see disala-06 decision #1) ---

const prepareEventSchema = z
  .object({
    summary: z.string().min(1).max(500),
    description: z.string().max(5000).optional(),
    start: isoDateTime,
    end: isoDateTime,
    timeZone: ianaTimeZone,
    attendees: z.array(z.object({ email: z.string().email() })).max(50).optional(),
    sendUpdates: z.enum(["all", "externalOnly", "none"]).optional(),
  })
  .refine((data) => new Date(data.end).getTime() > new Date(data.start).getTime(), {
    message: "end must be after start",
    path: ["end"],
  })

type EventPayload = {
  summary: string
  description: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  attendees: { email: string }[]
  sendUpdates: "all" | "externalOnly" | "none"
}

async function prepareEvent(userId: string, input: unknown): Promise<GoogleApiResult<EventPayload>> {
  const parsed = prepareEventSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)

  if (!(await hasUsableGoogleConnection(userId))) {
    return { ok: false, error: { code: "NOT_CONNECTED", message: "No Google account connected" } }
  }

  return {
    ok: true,
    data: {
      summary: parsed.data.summary,
      description: parsed.data.description ?? "",
      start: { dateTime: parsed.data.start, timeZone: parsed.data.timeZone },
      end: { dateTime: parsed.data.end, timeZone: parsed.data.timeZone },
      attendees: parsed.data.attendees ?? [],
      sendUpdates: parsed.data.sendUpdates ?? "all",
    },
  }
}

// --- createEvent (the first real Calendar write in this project — only
// ever called from lib/approvals.ts's post-approval execution step, never
// from an agent tool or route directly; see disala-07 decision #8/security) ---

// Matches EventPayload's exact shape. Re-validated here (unlike sendEmail's
// `raw`) because this payload sat in a Json column and lost its static type
// on the way — validating on the way back out is cheap insurance against a
// malformed row, not duplicated ceremony.
const createEventSchema = z.object({
  summary: z.string().min(1).max(500),
  description: z.string().max(5000),
  start: z.object({ dateTime: isoDateTime, timeZone: ianaTimeZone }),
  end: z.object({ dateTime: isoDateTime, timeZone: ianaTimeZone }),
  attendees: z.array(z.object({ email: z.string().email() })),
  sendUpdates: z.enum(["all", "externalOnly", "none"]),
})

type CreatedEvent = {
  id: string
  htmlLink: string
}

async function createEvent(userId: string, input: unknown): Promise<GoogleApiResult<CreatedEvent>> {
  const parsed = createEventSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)

  const clients = await getAuthorizedGoogleClients(userId)
  if (!clients.ok) return clients

  const result = await runGoogleApiCall(userId, () =>
    clients.data.calendar.events.insert({
      calendarId: "primary",
      sendUpdates: parsed.data.sendUpdates,
      requestBody: {
        summary: parsed.data.summary,
        description: parsed.data.description,
        start: parsed.data.start,
        end: parsed.data.end,
        attendees: parsed.data.attendees,
      },
    })
  )
  if (!result.ok) return result

  return {
    ok: true,
    data: { id: result.data.id ?? "", htmlLink: result.data.htmlLink ?? "" },
  }
}

// --- getEvent (single-event read) — used by the update/cancel prepare
// functions below to build a real snapshot from Google's own response,
// rather than trusting the model's arguments for what it's about to
// change or destroy (see disala-08 decision #2). Also a legitimate part
// of the Calendar read surface on its own, mirroring gmail.getEmail. ---

const getEventSchema = z.object({ eventId: z.string().min(1).max(200) })

type EventSnapshot = {
  summary: string
  description: string
  start: string | null
  end: string | null
  attendees: { email: string }[]
  htmlLink: string
  status: string
}

async function getEvent(userId: string, input: unknown): Promise<GoogleApiResult<EventSnapshot>> {
  const parsed = getEventSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)

  const clients = await getAuthorizedGoogleClients(userId)
  if (!clients.ok) return clients

  const result = await runGoogleApiCall(userId, () =>
    clients.data.calendar.events.get({
      calendarId: "primary",
      eventId: parsed.data.eventId,
    })
  )
  if (!result.ok) return result

  const event = result.data
  return {
    ok: true,
    data: {
      summary: event.summary ?? "",
      description: event.description ?? "",
      start: event.start?.dateTime ?? event.start?.date ?? null,
      end: event.end?.dateTime ?? event.end?.date ?? null,
      attendees: (event.attendees ?? []).map((attendee) => ({ email: attendee.email ?? "" })),
      htmlLink: event.htmlLink ?? "",
      status: event.status ?? "",
    },
  }
}

// --- prepareEventUpdate / prepareEventCancel (no Calendar *write* — but,
// unlike prepareEvent, these do call getEvent: reading isn't writing, and
// without a real read the approval card would show the model's guess at
// what it's about to change or destroy. See disala-08 decision #2.) ---

const eventChangesSchema = z
  .object({
    summary: z.string().min(1).max(500).optional(),
    description: z.string().max(5000).optional(),
    start: isoDateTime.optional(),
    end: isoDateTime.optional(),
    timeZone: ianaTimeZone.optional(),
    // If present, this is the COMPLETE new attendee list — Google's patch
    // semantics overwrite the whole array, they don't merge. Never treat
    // this as "adding" someone.
    attendees: z.array(z.object({ email: z.string().email() })).max(50).optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, "At least one change must be specified")
  .refine((changes) => !!changes.start === !!changes.end, {
    message: "start and end must both be provided together",
    path: ["end"],
  })
  .refine(
    (changes) =>
      !(changes.start && changes.end) || new Date(changes.end).getTime() > new Date(changes.start).getTime(),
    { message: "end must be after start", path: ["end"] }
  )
  .refine((changes) => !changes.start || !!changes.timeZone, {
    message: "timeZone is required when start/end change",
    path: ["timeZone"],
  })

const prepareEventUpdateSchema = z.object({
  eventId: z.string().min(1).max(200),
  changes: eventChangesSchema,
  sendUpdates: z.enum(["all", "externalOnly", "none"]).optional(),
})

const prepareEventCancelSchema = z.object({
  eventId: z.string().min(1).max(200),
  sendUpdates: z.enum(["all", "externalOnly", "none"]).optional(),
})

type EventUpdatePayload = {
  eventId: string
  changes: z.infer<typeof eventChangesSchema>
  sendUpdates: "all" | "externalOnly" | "none"
  snapshot: EventSnapshot
}

type EventCancelPayload = {
  eventId: string
  sendUpdates: "all" | "externalOnly" | "none"
  snapshot: EventSnapshot
}

async function prepareEventUpdate(
  userId: string,
  input: unknown
): Promise<GoogleApiResult<EventUpdatePayload>> {
  const parsed = prepareEventUpdateSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)

  const existing = await getEvent(userId, { eventId: parsed.data.eventId })
  if (!existing.ok) return existing
  if (existing.data.status === "cancelled") {
    return invalidInput("That event is already cancelled")
  }

  return {
    ok: true,
    data: {
      eventId: parsed.data.eventId,
      changes: parsed.data.changes,
      sendUpdates: parsed.data.sendUpdates ?? "all",
      snapshot: existing.data,
    },
  }
}

async function prepareEventCancel(
  userId: string,
  input: unknown
): Promise<GoogleApiResult<EventCancelPayload>> {
  const parsed = prepareEventCancelSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)

  const existing = await getEvent(userId, { eventId: parsed.data.eventId })
  if (!existing.ok) return existing
  if (existing.data.status === "cancelled") {
    return invalidInput("That event is already cancelled")
  }

  return {
    ok: true,
    data: {
      eventId: parsed.data.eventId,
      sendUpdates: parsed.data.sendUpdates ?? "all",
      snapshot: existing.data,
    },
  }
}

// --- updateEvent / cancelEvent (the second and third real Calendar writes
// in this project — only ever called from lib/approvals.ts's post-approval
// execution step, never from an agent tool or route directly; see
// disala-07 decision #8/security, applied again unchanged) ---

// Re-validated on the way out of the Json column, following createEvent's
// precedent. `snapshot` is accepted-and-ignored — display/audit data only,
// never sent to Google.
const updateEventSchema = z.object({
  eventId: z.string().min(1).max(200),
  changes: eventChangesSchema,
  sendUpdates: z.enum(["all", "externalOnly", "none"]),
  snapshot: z.unknown().optional(),
})

const cancelEventSchema = z.object({
  eventId: z.string().min(1).max(200),
  sendUpdates: z.enum(["all", "externalOnly", "none"]),
  snapshot: z.unknown().optional(),
})

type UpdatedEvent = {
  eventId: string
  htmlLink: string
}

async function updateEvent(userId: string, input: unknown): Promise<GoogleApiResult<UpdatedEvent>> {
  const parsed = updateEventSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)

  const clients = await getAuthorizedGoogleClients(userId)
  if (!clients.ok) return clients

  const { changes } = parsed.data
  const requestBody: Record<string, unknown> = {}
  if (changes.summary !== undefined) requestBody.summary = changes.summary
  if (changes.description !== undefined) requestBody.description = changes.description
  if (changes.start !== undefined) {
    requestBody.start = { dateTime: changes.start, timeZone: changes.timeZone }
  }
  if (changes.end !== undefined) {
    requestBody.end = { dateTime: changes.end, timeZone: changes.timeZone }
  }
  if (changes.attendees !== undefined) requestBody.attendees = changes.attendees

  const result = await runGoogleApiCall(userId, () =>
    clients.data.calendar.events.patch({
      calendarId: "primary",
      eventId: parsed.data.eventId,
      sendUpdates: parsed.data.sendUpdates,
      requestBody,
    })
  )
  if (!result.ok) return result

  return {
    ok: true,
    data: { eventId: result.data.id ?? parsed.data.eventId, htmlLink: result.data.htmlLink ?? "" },
  }
}

type CancelledEvent = {
  eventId: string
  cancelled: true
}

async function cancelEvent(userId: string, input: unknown): Promise<GoogleApiResult<CancelledEvent>> {
  const parsed = cancelEventSchema.safeParse(input)
  if (!parsed.success) return invalidInput(parsed.error.issues[0]?.message)

  const clients = await getAuthorizedGoogleClients(userId)
  if (!clients.ok) return clients

  // events.delete returns an empty body on success — there is no provider
  // identifier to record, so `result` below is exactly "Google accepted
  // the request," not a fabricated confirmation id.
  const result = await runGoogleApiCall(userId, () =>
    clients.data.calendar.events.delete({
      calendarId: "primary",
      eventId: parsed.data.eventId,
      sendUpdates: parsed.data.sendUpdates,
    })
  )
  if (!result.ok) return result

  return { ok: true, data: { eventId: parsed.data.eventId, cancelled: true } }
}

export type { CalendarEvent }
export {
  getEvents,
  findAvailableTimes,
  prepareEvent,
  createEvent,
  getEvent,
  prepareEventUpdate,
  prepareEventCancel,
  updateEvent,
  cancelEvent,
}
