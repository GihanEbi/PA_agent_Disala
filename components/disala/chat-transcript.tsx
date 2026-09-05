"use client"

import { VoiceResponseCard } from "@/components/disala/voice-response-card"
import { ApprovalCard, type ApprovalData } from "@/components/disala/approval-card"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  approvals?: ApprovalData[]
}

function ChatTranscript({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="flex w-full flex-1 flex-col gap-3 overflow-y-auto">
      {messages.map((message) =>
        message.role === "user" ? (
          <div
            key={message.id}
            className="ml-auto max-w-[85%] rounded-md bg-teal-500/15 px-4 py-3 text-sm text-foreground"
          >
            {message.content}
          </div>
        ) : (
          <div key={message.id} className="flex flex-col gap-3">
            <VoiceResponseCard heading="Disala" subtext={message.content} />
            {message.approvals?.map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} />
            ))}
          </div>
        )
      )}
    </div>
  )
}

export { ChatTranscript, type ChatMessage }
