import { NextRequest, NextResponse } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { generateText, stepCountIs } from "ai"
import { openai } from "@ai-sdk/openai"
import { z } from "zod"

import { getOrCreateInternalUser } from "@/lib/get-or-create-user"
import {
  getOrCreateActiveConversation,
  appendUserMessage,
  appendAssistantMessage,
  listRecentMessages,
} from "@/lib/conversations"
import { buildAgentTools } from "@/lib/agent/tools"
import { buildSystemPrompt } from "@/lib/agent/system-prompt"
import { db } from "@/lib/db"

const chatRequestSchema = z.object({ message: z.string().min(1).max(4000) })

// Bounds both latency and OpenAI cost per turn against a runaway loop — not
// a defense against repeated abusive turns (no rate limiting exists yet,
// see disala-07's Assumptions).
const MAX_AGENT_STEPS = 8

// The only history the model ever sees — targeted retrieval (AGENTS.md
// §13), not the whole conversation. Everything past this is still stored,
// just not sent to the model.
const MAX_HISTORY_MESSAGES = 20

// Tools whose result carries an `approvalId` this route surfaces as a
// rendered card — kept in one place so adding a new propose_* tool can't
// silently leave its approval invisible in chat (an easy thing to miss,
// per disala-08).
const PROPOSE_TOOL_NAMES = new Set([
  "propose_email",
  "propose_meeting",
  "propose_update_meeting",
  "propose_cancel_meeting",
])

export async function POST(req: NextRequest) {
  const { userId: clerkUserId } = await auth()
  if (!clerkUserId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsedRequest = chatRequestSchema.safeParse(body)
  if (!parsedRequest.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const internalUser = await getOrCreateInternalUser()
  if (!internalUser) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  }

  const conversation = await getOrCreateActiveConversation(internalUser.id)
  const userMessage = await appendUserMessage(conversation.id, parsedRequest.data.message)

  // Model context comes exclusively from the server's own persisted
  // history — the client-supplied request body is only ever { message },
  // never a message array the server would trust as prior context.
  const history = await listRecentMessages(conversation.id, MAX_HISTORY_MESSAGES)
  const modelMessages = history.map((message) => ({
    role: message.role === "USER" ? ("user" as const) : ("assistant" as const),
    content: message.content,
  }))

  const tools = buildAgentTools(internalUser.id, conversation.id)

  try {
    const result = await generateText({
      model: openai.chat("gpt-5.6-terra"),
      // gpt-5.6-terra is a reasoning-tier model; OpenAI's Chat Completions
      // endpoint rejects function/tool calling for it unless reasoning
      // effort is explicitly "none" ("Function tools with reasoning_effort
      // are not supported for gpt-5.6-terra in /v1/chat/completions" —
      // hit live and confirmed against OpenAI's own error message).
      providerOptions: { openai: { reasoningEffort: "none" } },
      system: buildSystemPrompt({
        userName: internalUser.name,
        timezone: internalUser.timezone,
        now: new Date(),
      }),
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(MAX_AGENT_STEPS),
    })

    const toolCallSummary = result.steps.flatMap((step) =>
      step.toolCalls.map((call) => {
        const matchingResult = step.toolResults.find(
          (toolResult) => toolResult.toolCallId === call.toolCallId
        )
        return { toolName: call.toolName, input: call.input, output: matchingResult?.output }
      })
    )

    const assistantMessage = await appendAssistantMessage(
      conversation.id,
      result.text,
      toolCallSummary
    )

    const approvalIds = toolCallSummary
      .filter((call) => PROPOSE_TOOL_NAMES.has(call.toolName))
      .map((call) => (call.output as { approvalId?: string } | undefined)?.approvalId)
      .filter((id): id is string => !!id)

    const approvals = approvalIds.length
      ? await db.approval.findMany({
          where: { id: { in: approvalIds }, userId: internalUser.id },
        })
      : []

    return NextResponse.json({
      userMessage: { id: userMessage.id, content: userMessage.content },
      assistantMessage: { id: assistantMessage.id, content: assistantMessage.content },
      approvals,
    })
  } catch (err) {
    console.error("Chat agent error:", err instanceof Error ? err.message : err)
    return NextResponse.json(
      {
        userMessage: { id: userMessage.id, content: userMessage.content },
        error: "Disala couldn't respond — try again.",
      },
      { status: 502 }
    )
  }
}
