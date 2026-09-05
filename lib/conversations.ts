import "server-only"

import { db } from "@/lib/db"
import { MessageRole } from "@/lib/generated/prisma/enums"
import type { Prisma } from "@/lib/generated/prisma/client"

/**
 * One continuous conversation per user (no thread switcher — see
 * prompts/disala-07-agent-chat-approvals.md decision #12). Returns the
 * user's existing conversation if there is one, or creates the first one.
 */
async function getOrCreateActiveConversation(userId: string) {
  const existing = await db.conversation.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  })
  if (existing) return existing
  return db.conversation.create({ data: { userId } })
}

async function appendUserMessage(conversationId: string, content: string) {
  return db.message.create({
    data: { conversationId, role: MessageRole.USER, content },
  })
}

async function appendAssistantMessage(
  conversationId: string,
  content: string,
  toolCalls: unknown[]
) {
  return db.message.create({
    data: {
      conversationId,
      role: MessageRole.ASSISTANT,
      content,
      toolCalls: toolCalls.length > 0 ? (toolCalls as Prisma.InputJsonValue) : undefined,
    },
  })
}

/**
 * Newest-N messages, restored to chronological order — the only history
 * the model ever sees (targeted retrieval, not the whole conversation).
 */
async function listRecentMessages(conversationId: string, limit: number) {
  const rows = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit,
  })
  return rows.reverse()
}

export { getOrCreateActiveConversation, appendUserMessage, appendAssistantMessage, listRecentMessages }
