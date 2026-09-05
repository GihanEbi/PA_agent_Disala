import "server-only"
import { z } from "zod"
import { tool } from "ai"

import { searchEmails, getEmail, createDraft } from "@/lib/integrations/gmail"
import {
  getEvents,
  findAvailableTimes,
  prepareEvent,
  prepareEventUpdate,
  prepareEventCancel,
} from "@/lib/integrations/calendar"
import { createNote, searchNotes } from "@/lib/notes"
import { createApproval } from "@/lib/approvals"
import { ApprovalActionType } from "@/lib/generated/prisma/enums"
import type { Prisma } from "@/lib/generated/prisma/client"

/**
 * Built once per chat request, after `userId` is resolved server-side from
 * the authenticated session. The Zod `inputSchema` the model actually sees
 * never includes `userId`/`conversationId` — the closures below capture
 * them instead, so the model has no parameter it could ever use to act as
 * a different user (disala-07 decision #5).
 */
function buildAgentTools(userId: string, conversationId: string) {
  return {
    search_emails: tool({
      description:
        "Search the user's Gmail inbox. Use unreadOnly/importantOnly/after/before to narrow results.",
      inputSchema: z.object({
        query: z.string().optional(),
        unreadOnly: z.boolean().optional(),
        importantOnly: z.boolean().optional(),
        after: z.string().optional(),
        before: z.string().optional(),
        maxResults: z.number().int().positive().max(50).optional(),
      }),
      execute: async (input) => searchEmails(userId, input),
    }),

    get_email: tool({
      description:
        "Get the full content of one email by its Gmail message id (from search_emails results).",
      inputSchema: z.object({ messageId: z.string() }),
      execute: async (input) => getEmail(userId, input),
    }),

    get_calendar_events: tool({
      description: "List the user's calendar events in a time range.",
      inputSchema: z.object({
        timeMin: z.string(),
        timeMax: z.string(),
        maxResults: z.number().int().positive().max(50).optional(),
      }),
      execute: async (input) => getEvents(userId, input),
    }),

    find_available_times: tool({
      description:
        "Find free time slots of a given duration in a time range on the user's calendar.",
      inputSchema: z.object({
        timeMin: z.string(),
        timeMax: z.string(),
        durationMinutes: z.number().int().positive(),
      }),
      execute: async (input) => findAvailableTimes(userId, input),
    }),

    search_notes: tool({
      description: "Search the user's own saved notes.",
      inputSchema: z.object({ query: z.string() }),
      execute: async (input) => {
        const notes = await searchNotes({ userId, query: input.query })
        return notes.map((note) => ({ id: note.id, title: note.title, content: note.content }))
      },
    }),

    create_note: tool({
      description:
        "Save a new note for the user immediately. No approval needed — this is the user's own first-party data, same as if they typed it themselves.",
      inputSchema: z.object({ content: z.string().min(1) }),
      execute: async (input) => {
        const note = await createNote({ userId, content: input.content })
        return { id: note.id, content: note.content }
      },
    }),

    propose_email: tool({
      description:
        "Prepare a new email or reply for the user's review. This does NOT send anything — it creates a pending approval the user must explicitly approve before Disala sends it.",
      inputSchema: z.object({
        to: z.array(z.string().email()).min(1),
        cc: z.array(z.string().email()).optional(),
        subject: z.string().min(1),
        bodyText: z.string().min(1),
        inReplyToMessageId: z.string().optional(),
        threadId: z.string().optional(),
      }),
      execute: async (input) => {
        const draft = await createDraft(userId, input)
        if (!draft.ok) return draft

        const approval = await createApproval({
          userId,
          conversationId,
          actionType: ApprovalActionType.EMAIL_SEND,
          title: `Send email to ${draft.data.to.join(", ")}`,
          description: "Disala prepared this email based on your conversation.",
          payload: draft.data as unknown as Prisma.InputJsonValue,
        })

        return { approvalId: approval.id, status: "pending_approval" as const }
      },
    }),

    propose_meeting: tool({
      description:
        "Prepare a new calendar event for the user's review. This does NOT create anything — it creates a pending approval the user must explicitly approve before Disala creates the event.",
      inputSchema: z.object({
        summary: z.string().min(1),
        description: z.string().optional(),
        start: z.string(),
        end: z.string(),
        timeZone: z.string(),
        attendees: z.array(z.object({ email: z.string().email() })).optional(),
        sendUpdates: z.enum(["all", "externalOnly", "none"]).optional(),
      }),
      execute: async (input) => {
        const prepared = await prepareEvent(userId, input)
        if (!prepared.ok) return prepared

        const approval = await createApproval({
          userId,
          conversationId,
          actionType: ApprovalActionType.CALENDAR_CREATE,
          title: `Create calendar event: ${prepared.data.summary}`,
          description: "Disala prepared this meeting based on your conversation.",
          payload: prepared.data as unknown as Prisma.InputJsonValue,
        })

        return { approvalId: approval.id, status: "pending_approval" as const }
      },
    }),

    propose_update_meeting: tool({
      description:
        "Prepare a change to an existing calendar event for the user's review. This does NOT change anything — it creates a pending approval the user must explicitly approve before Disala applies the change. Only pass the fields that should change. Passing attendees replaces the ENTIRE guest list, it does not add to it.",
      inputSchema: z.object({
        eventId: z.string().min(1),
        summary: z.string().optional(),
        description: z.string().optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        timeZone: z.string().optional(),
        attendees: z.array(z.object({ email: z.string().email() })).optional(),
        sendUpdates: z.enum(["all", "externalOnly", "none"]).optional(),
      }),
      execute: async (input) => {
        const { eventId, sendUpdates, ...changes } = input
        const prepared = await prepareEventUpdate(userId, { eventId, changes, sendUpdates })
        if (!prepared.ok) return prepared

        const approval = await createApproval({
          userId,
          conversationId,
          actionType: ApprovalActionType.CALENDAR_UPDATE,
          title: `Update meeting: ${prepared.data.snapshot.summary}`,
          description: "Disala prepared this change based on your conversation.",
          payload: prepared.data as unknown as Prisma.InputJsonValue,
        })

        return { approvalId: approval.id, status: "pending_approval" as const }
      },
    }),

    propose_cancel_meeting: tool({
      description:
        "Prepare the cancellation of an existing calendar event for the user's review. This does NOT cancel anything — it creates a pending approval the user must explicitly approve before Disala cancels the event. Cancelling is irreversible and notifies the people invited — only propose this when the user has clearly asked for it.",
      inputSchema: z.object({
        eventId: z.string().min(1),
        sendUpdates: z.enum(["all", "externalOnly", "none"]).optional(),
      }),
      execute: async (input) => {
        const prepared = await prepareEventCancel(userId, input)
        if (!prepared.ok) return prepared

        const approval = await createApproval({
          userId,
          conversationId,
          actionType: ApprovalActionType.CALENDAR_CANCEL,
          title: `Cancel meeting: ${prepared.data.snapshot.summary}`,
          description: "Disala prepared this cancellation based on your conversation.",
          payload: prepared.data as unknown as Prisma.InputJsonValue,
        })

        return { approvalId: approval.id, status: "pending_approval" as const }
      },
    }),
  }
}

export { buildAgentTools }
