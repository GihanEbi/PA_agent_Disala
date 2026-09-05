/**
 * Scopes requested when connecting a user's Google account, kept to the
 * minimum needed for the Gmail/Calendar capabilities described in
 * AGENTS.md §9-10 (see prompts/disala-04-google-connected-accounts.md for
 * the reasoning behind each one). Shared by the client-side connect button
 * and any server-side code that needs to know what was requested.
 */
const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
] as const

export { GOOGLE_OAUTH_SCOPES }
