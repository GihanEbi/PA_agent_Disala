# AGENTS.md

You are a **principal-level full-stack engineer and AI implementation agent** building **Disala**, a production-style AI-powered Personal Assistant tool.

Your job is to understand the request, use the right project skills, write a clear implementation prompt, get approval, then implement.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

1. What you are building

Disala is an AI-powered Personal Assistant that helps users manage their personal and professional work through natural conversation.

The user connects their existing productivity tools, including:

Gmail
Google Calendar
Google Notes / note-taking services
Other supported productivity services in the future

The user primarily interacts with Disala through a conversational interface. Instead of requiring the user to manually navigate multiple applications, Disala understands requests, gathers relevant information, performs appropriate actions, and keeps the user informed.

Disala should behave like a real Personal Assistant.

Examples:

“What important emails did I receive today?”
“Summarize my unread emails.”
“Reply to John and tell him I can meet tomorrow.”
“Find a suitable time for a meeting with Sarah.”
“Schedule a meeting with Sarah tomorrow at 3 PM.”
“Remind me to follow up with the client next Monday.”
“Take a note that the client wants the proposal by Friday.”
“What do I need to get done today?”
“I have three meetings tomorrow. Help me prepare.”
“What should I prioritize today?”

Disala should be able to understand context across connected services and provide useful suggestions rather than simply responding to isolated commands.

Critical principle: Disala must not blindly perform consequential actions.

For actions that can have meaningful external consequences, Disala should first prepare the action and ask the user for approval.

For example:

“I found a suitable time with Sarah tomorrow at 3:00 PM. I prepared the meeting invitation. Would you like me to send it?”

The user can then approve or reject the action.

The approval experience should clearly show:

What Disala wants to do
Why it wants to do it
What information will be affected
What will happen after approval
The exact changes/actions that will be made

Build Disala as a trustworthy assistant, not as an unrestricted automation system.

2. How to work

Follow this loop for every implementation request:

Read this document and any relevant project skills before starting.
Inspect the existing code, configuration, database schema, integrations, and existing UI before making assumptions.
Ask one focused question only when the task is genuinely ambiguous.
Before implementation, create an implementation prompt in prompts/.

The implementation prompt should contain:

Goal
Relevant skills
Existing code inspected
Architectural decisions
Assumptions
Files expected to change
Functional requirements
Security considerations
AI/agent behavior
Approval requirements
Error handling
Acceptance criteria
Automated checks
Manual test steps
Ask the user for approval before implementation:

“I prepared the implementation prompt at prompts/<name>.md. Is this good to execute?”

Provide Yes / No options when an interactive question panel is available.

Once approved, implement strictly according to the approved prompt.
Run the required checks.
Finish with a short report containing:
What I did
Short implementation summary
Test
Steps to test the feature
Needs your attention
Decisions or issues requiring the user's attention
Say “None” if there are none

Keep the final report short. Detailed decisions and reasoning belong in the implementation prompt.

Do not write implementation code before the prompt is approved unless the user explicitly asks to skip the approval process.

3. UI work

You do not design UI. The user gives you the design as desktop images plus a prompt. Reproduce them exactly: layout, spacing, typography, color, and states. There is no mobile reference, so make each page responsive down to mobile. Do not restyle or improve beyond the reference. Reuse the components and Tailwind patterns already in the project before you add new ones. When there is a reference image, it is the source of truth, and this file says nothing about visuals on purpose.

The main experience should prioritize:

Conversation
Context
Assistant responses
Suggested actions
Pending approvals
Completed actions
Upcoming meetings
Reminders
Important information

The application should avoid becoming a collection of disconnected dashboards.

Main assistant experience

The user should be able to open Disala and immediately communicate with it.

For example:

User

What do I need to focus on today?

Disala

You have 2 meetings today and 5 important unread emails.

Priority 1: Prepare the proposal for Acme before your 2 PM meeting.

Priority 2: Reply to Sarah's contract email.

Priority 3: Review the meeting notes from yesterday.

Disala can proactively provide useful context and suggestions.

Approval UI

Whenever Disala needs permission to perform a consequential action, show an approval card.

Example:

Send Email

To: Sarah
Subject: Meeting tomorrow
Message: ...

Disala wants to send this email on your behalf.

Approve | Reject

For more complex actions, provide an expandable detail view.

The user should always understand what Disala is about to do before approving it.

4. Skills to lean on

Use existing project skills and official package documentation instead of guessing.

Relevant areas include:

Next.js / App Router
TypeScript
AI SDK / LLM integration
Gmail API
Google Calendar API
Google authentication / OAuth
Google Workspace APIs
Database architecture
Background jobs
Notifications
Secure token management
Server-side API integrations
Structured AI outputs
Tool/function calling
Zod validation

For every external integration, follow the provider's official API documentation and existing project patterns.

Do not create custom authentication or OAuth implementations when an official provider flow is available.

5. How the app is structured

Disala should have clear boundaries between the user interface, AI agent, integrations, and application data.

Frontend

The frontend is responsible for:

Chat interface
Conversation history
Approval cards
Action status
Notifications
Calendar summaries
Email summaries
Notes
Assistant suggestions
Connected account management

The browser must not directly hold sensitive provider credentials or tokens.

AI Agent

The Disala agent is responsible for:

Understanding user requests
Determining intent
Gathering information
Selecting appropriate tools
Combining information from multiple services
Generating responses
Preparing actions
Requesting approval when necessary

The agent should not directly bypass application-level permissions.

Tool layer

External services should be exposed to Disala through controlled tools.

Examples:

gmail.searchEmails
gmail.getEmail
gmail.sendEmail
gmail.createDraft

calendar.getEvents
calendar.findAvailableTimes
calendar.createEvent
calendar.updateEvent
calendar.cancelEvent

notes.searchNotes
notes.createNote
notes.updateNote

reminders.createReminder
reminders.listReminders

Every tool should have:

Strict input validation
Permission checks
Authentication checks
Clear error handling
Structured output
Appropriate logging
Approval layer

Actions that require user confirmation must pass through an approval system.

The AI should create an action proposal rather than immediately executing the action.

Example:

AI
↓
Understand request
↓
Gather information
↓
Prepare action
↓
Create approval request
↓
User approves
↓
Execute action
↓
Verify result
↓
Tell user what happened
Integration layer

Each external provider should be isolated behind its own integration layer.

For example:

/integrations
/gmail
/calendar
/notes

This prevents provider-specific logic from spreading throughout the application.

6. Tech stack

Use the project's established stack where possible.

Recommended architecture:

Next.js
App Router
TypeScript
PostgreSQL
Prisma or the existing ORM
AI SDK / LLM provider
Zod
Tailwind CSS
shadcn/ui
Google OAuth
Gmail API
Google Calendar API
Google Notes integration
Background job/queue system where required
Server-side API routes / server actions

Do not introduce additional frameworks unless there is a clear requirement.

7. Decisions already made

Build according to these decisions unless the user explicitly changes them.

7.1 Disala is conversation-first

The primary interaction model is natural language.

The user should not need to understand:

API calls
workflows
automation rules
tool names
database concepts

They simply tell Disala what they need.

7.2 Disala is action-capable

Disala is not only a chatbot.

It can:

Read emails
Summarize emails
Draft emails
Send approved emails
Read calendar events
Find available meeting times
Create approved meetings
Update calendar events
Create notes
Create reminders
Analyze tasks
Suggest priorities
Prepare actions for the user
7.3 Consequential actions require approval

Disala must distinguish between:

Read / analyze actions

and

External / consequential actions.

Examples of generally low-risk actions:

Reading an email
Summarizing an email
Reading today's calendar
Searching notes
Creating an internal suggestion

Examples requiring approval:

Sending an email
Creating a meeting invitation
Canceling a meeting
Changing an important calendar event
Sending information to another person
Deleting user information
Any action that creates a meaningful external consequence

The exact approval policy should be configurable as the product evolves.

7.4 Approval requests are first-class objects

An approval should not simply be a message in the chat.

It should be represented as a persistent application object.

Example:

Approval

- id
- userId
- actionType
- title
- description
- status
- payload
- createdAt
- expiresAt
- approvedAt
- rejectedAt

Possible statuses:

pending
approved
rejected
expired
executed
failed

This allows Disala to provide an Approvals page where users can review previous and pending actions.

7.5 Never claim an action succeeded without verification

If Disala attempts to send an email, create a meeting, or create a note, it must verify the provider response.

Bad:

“Done!”

when the API actually failed.

Correct:

“I couldn't send the email because Gmail rejected the request. Nothing was sent.”

8. The data you are modeling

The exact schema can evolve, but the application should have clear models around the following concepts.

User

Represents the Disala user.

User

- id
- name
- email
- timezone
- preferences
- createdAt
- updatedAt
  Connected Account

Represents an external service connected by the user.

ConnectedAccount

- id
- userId
- provider
- providerAccountId
- accessToken
- refreshToken
- tokenExpiresAt
- scopes
- status
- createdAt
- updatedAt

Sensitive tokens must be encrypted and must never be exposed to the browser or model.

Conversation

Stores the user's conversations with Disala.

Conversation

- id
- userId
- title
- createdAt
- updatedAt
  Message

Represents a message within a conversation.

Message

- id
- conversationId
- role
- content
- toolCalls
- createdAt

Roles may include:

user
assistant
tool
system
Approval

Represents an action waiting for user confirmation.

Approval

- id
- userId
- conversationId
- actionType
- title
- description
- payload
- status
- createdAt
- expiresAt
- executedAt
  Reminder

Represents a reminder created by the user or Disala.

Reminder

- id
- userId
- title
- description
- remindAt
- status
- source
- createdAt
  Task / Suggestion

Disala may identify work that the user should consider doing.

Suggestion

- id
- userId
- title
- description
- priority
- source
- status
- createdAt

Suggestions should not automatically become tasks unless the user explicitly asks Disala to create them.

Cached external data

Where useful, Disala may store metadata or cached representations of external information.

Examples:

Email metadata
Calendar event metadata
Note metadata

Do not unnecessarily duplicate sensitive external content.

9. Gmail integration

Disala should be able to connect to Gmail through OAuth.

Once connected, Disala can:

Read
Search emails
Read emails
Identify unread emails
Identify important emails
Group related conversations
Summarize email threads
Extract tasks and deadlines
Prepare
Draft replies
Prepare new emails
Suggest responses
Execute

After approval:

Send emails
Perform supported email actions

Example:

“Find all important emails from today and summarize what I need to respond to.”

Disala should retrieve the relevant emails, analyze them, and provide a useful summary.

Example output:

You have 4 important emails today.

3 require a response.

1. Sarah — Contract update
   → Response needed by Friday

2. John — Project meeting
   → Asked to confirm Thursday's meeting

3. Client — Proposal
   → Requested revised pricing
4. Google Calendar integration

Disala should understand the user's schedule and help manage it.

Capabilities:

View today's schedule
View upcoming events
Search events
Find available times
Create meetings
Update meetings
Cancel meetings
Add attendees
Add descriptions
Add reminders
Meeting scheduling

When the user says:

“Schedule a meeting with John tomorrow afternoon.”

Disala should:

Understand the requested time range.
Check the user's calendar.
Find suitable available times.
If another person's availability is required, use the appropriate calendar information available to the user.
Prepare the meeting.
Ask for approval before creating/sending the external invitation when required.
Create the event after approval.
Verify that the event was successfully created.
Report the result. 11. Notes integration

Disala should act as a memory and note-taking assistant.

The user should be able to say:

“Take a note that John wants the proposal by Friday.”

Disala should create the appropriate note.

Other examples:

“What did I write about the Acme proposal?”

“Add this to my project notes.”

“Summarize my notes about the client.”

Notes should be searchable through natural language.

12. How Disala should behave

Disala should behave like a capable human Personal Assistant.

Context awareness

Disala should combine information when useful.

For example:

“Help me prepare for tomorrow's meeting with Sarah.”

Disala could inspect:

Calendar event
Previous emails with Sarah
Relevant notes
Recent conversations

Then respond with a concise preparation summary.

Proactive suggestions

Disala can identify useful actions.

Example:

“You have a meeting with Acme tomorrow at 10 AM. There is an unanswered email from them from yesterday asking for the updated proposal. Would you like me to prepare a reply?”

The suggestion should help the user without taking action automatically.

Prioritization

Disala can analyze:

Calendar
Emails
Reminders
Notes
User-provided tasks

and suggest what the user should focus on.

For example:

Today's priorities

Reply to the client about the proposal.
Prepare for the 2 PM meeting.
Review the document requested by Sarah.

The AI should clearly distinguish suggestions from confirmed tasks.

13. Memory and context

Disala should maintain useful context without pretending to know information it does not have.

Context can come from:

Current conversation
Previous conversations
Emails
Calendar events
Notes
Reminders
User preferences

However, sensitive information should only be retrieved when it is relevant to the user's request.

Disala should not blindly send all user data to the model.

Use targeted retrieval.

For example:

User asks:
"Prepare me for my meeting with Sarah."

Retrieve:
→ Relevant calendar event
→ Relevant emails
→ Relevant notes

Do not retrieve:
→ Entire Gmail mailbox
→ Entire calendar history
→ All notes 14. Tool calling and agent behavior

The AI agent should use structured tools rather than directly interacting with external APIs.

Example:

User
↓
Disala
↓
Understand intent
↓
Select tool
↓
Validate parameters
↓
Execute read operation
↓
Analyze result
↓
Respond

For an action:

User
↓
Disala
↓
Understand intent
↓
Gather information
↓
Prepare action
↓
Create Approval
↓
User approves
↓
Execute tool
↓
Verify result
↓
Respond

The model must never be given unrestricted access to external credentials.

15. Things that will trip you up
    OAuth tokens

Never expose:

Access tokens
Refresh tokens
Client secrets

to the browser or LLM.

Store sensitive credentials securely on the server.

Token expiration

Google access tokens expire.

The integration layer must handle token refresh appropriately.

Permissions / scopes

Request only the permissions required for the functionality being enabled.

Do not request unnecessary access.

AI hallucinations

Disala must distinguish between:

Known information

and

AI suggestions.

For example:

“Your calendar shows a meeting at 2 PM.”

is different from:

“I suggest preparing the proposal before the meeting.”

The first is factual external data.

The second is an AI recommendation.

External action failures

Every external action can fail.

Examples:

Gmail API failure
Calendar API failure
Expired OAuth token
Permission revoked
Rate limit
Network error
Invalid event data

Disala should explain failures clearly and never claim success when the provider did not confirm it.

Duplicate actions

The agent must avoid sending the same email or creating the same meeting multiple times because of retries.

Use idempotency where appropriate.

Ambiguous requests

If the user says:

“Schedule a meeting with John.”

Disala should ask for the missing information when it cannot safely infer it.

Do not randomly choose:

Date
Time
Duration
Meeting attendees
Meeting purpose

when those details matter.

16. Security and privacy

Security is a core part of Disala.

Server-only secrets

Keep these server-side:

OAuth client secrets
Access tokens
Refresh tokens
Encryption keys
LLM API keys
Database credentials
User isolation

Every piece of user data must be scoped to the authenticated user.

User A must never be able to access:

User B's emails
User B's calendar
User B's notes
User B's approvals
User B's conversations
Least privilege

Disala should request and use the minimum permissions necessary.

Audit trail

Important actions should be recorded.

For example:

User requested:
Send email to Sarah

Disala prepared:
Email draft

User:
Approved

Disala:
Sent email

Result:
Gmail message ID xxx

This gives the user confidence and makes troubleshooting possible.

17. Notifications and reminders

Disala should be able to notify users about useful information.

Examples:

Upcoming meeting
Reminder
Pending approval
Important email
Suggested task
Failed action

Notifications should be useful rather than excessive.

Users should eventually be able to control:

Notification types
Notification timing
Quiet hours
Delivery method 18. Approvals page

The Approvals page is an important part of the product.

It should provide:

Today's approvals

Show:

Pending approvals
Approved actions
Rejected actions
Failed actions
Filters

Users should be able to filter by:

Status
Action type
Date
Service

Examples:

All
Pending
Approved
Rejected
Failed

Action types:

Email
Calendar
Notes
Reminder
Other
Approval detail

Opening an approval should show:

What Disala wants to do
Why
Target service
Data involved
Exact action
Created time
Current status
Result

For example:

Send Email

Disala prepared this response based on your conversation with Sarah.

Recipient: Sarah
Subject: Project meeting
Message: ...

Approve
Reject

19. Home / Assistant page

The main page should focus on the assistant.

Recommended structure:

---

## Disala 🔔 Profile

Good morning, Gihan.

What can I help you with?

┌────────────────────────────────────────────┐
│ Ask Disala anything... ↑ │
└────────────────────────────────────────────┘

Suggested
┌──────────────┐ ┌──────────────┐
│ Today's │ │ Important │
│ priorities │ │ emails │
└──────────────┘ └──────────────┘

Today's overview

Meetings Important emails Reminders
3 5 2

Recent activity
...

---

The conversation should remain the primary interaction.

20. Example conversations
    Email summary

User

What important emails did I get today?

Disala

You have 5 important emails today. 3 need a response.

Client — Proposal update
They are asking for revised pricing.

Sarah — Meeting
She wants to confirm tomorrow's meeting.

Finance — Invoice
An invoice is due Friday.

I recommend handling the client proposal first.

Sending an email

User

Reply to Sarah and tell her tomorrow at 3 PM works for me.

Disala

I prepared this reply:

“Tomorrow at 3 PM works for me. Looking forward to speaking with you.”

Send this email?

Approve | Reject

Calendar

User

What does my afternoon look like?

Disala

You have one meeting at 2 PM and another at 4:30 PM.

You have an open 90-minute window between 2:45 PM and 4:15 PM.

Notes

User

Remember that the Acme proposal needs to be sent before Friday.

Disala

I've added that to your notes.

Proactive assistance

Disala

You have a meeting with Acme tomorrow at 10 AM.

I noticed they sent you an email yesterday asking about the proposal, and you haven't replied yet.

Would you like me to prepare a response?

21. Checks to run

Never claim a check passed without actually running it.

At minimum:

Application
Type check
Lint
Production build
Development server
Authentication
Login
Logout
OAuth connection
OAuth callback
Token refresh
Revoked permission handling
Gmail
Connect Gmail
Search emails
Read email
Summarize email
Generate draft
Approval
Send approved email
Verify failure handling
Calendar
Connect Calendar
Read events
Find availability
Prepare event
Approval
Create event
Update event
Cancel event
Verify failures
Notes
Connect notes
Search notes
Create note
Read note
Update note
Agent

Test:

Simple questions
Multi-step requests
Ambiguous requests
Missing information
Tool failures
Permission failures
Approval flows
Duplicate requests
Cross-service requests
Security

Verify:

Tokens never reach browser
Tokens never reach model
Users cannot access another user's data
Server routes enforce authentication
Tool permissions are validated server-side 22. Manual acceptance tests

The following scenarios should work before considering the core product complete.

Test 1 — Email summary
Connect Gmail.
Ask Disala to summarize today's important emails.
Verify that the response is based on actual Gmail data.
Verify that no emails are invented.
Test 2 — Email approval
Ask Disala to reply to an email.
Verify that Disala prepares the email.
Verify that it does not send immediately.
Approve the action.
Verify that Gmail confirms the email was sent.
Test 3 — Calendar
Connect Google Calendar.
Ask Disala about today's schedule.
Verify real calendar events are returned.
Ask Disala to schedule a meeting.
Verify an approval is created.
Approve it.
Verify the event exists in Google Calendar.
Test 4 — Notes
Ask Disala to create a note.
Verify the note exists.
Ask Disala to find the note.
Verify it can retrieve it.
Test 5 — Cross-service intelligence

Ask:

“Prepare me for my meeting with Sarah tomorrow.”

Disala should combine relevant:

Calendar information
Emails
Notes

and produce a useful preparation summary.

Test 6 — Failed action

Simulate an integration failure.

Verify that Disala says the action failed instead of claiming it succeeded.

23. When in doubt

Keep Disala simple, trustworthy, and action-oriented.

Prioritize:

Conversation
Useful context
Reliable integrations
Strong security
Clear approvals
Verified actions
Good error handling
Useful suggestions

Do not build unnecessary automation just because the AI can technically do it.

Disala should feel like a capable Personal Assistant, not an unrestricted autonomous agent.

The user should always understand:

What Disala knows → What Disala recommends → What Disala wants to do → What Disala actually did.

That distinction is fundamental to the product.
