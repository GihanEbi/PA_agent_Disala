import "server-only"
import { OAuth2Client } from "google-auth-library"
import { gmail, type gmail_v1 } from "@googleapis/gmail"
import { calendar, type calendar_v3 } from "@googleapis/calendar"
import { clerkClient } from "@clerk/nextjs/server"

import { db } from "@/lib/db"
import { getGoogleConnectedAccount, markGoogleConnectionNeedsReauth } from "@/lib/connected-accounts"
import { ConnectedAccountStatus } from "@/lib/generated/prisma/enums"

type GoogleApiErrorCode =
  | "NOT_CONNECTED"
  | "NEEDS_REAUTH"
  | "INSUFFICIENT_SCOPE"
  | "RATE_LIMITED"
  | "INVALID_INPUT"
  | "PROVIDER_ERROR"

type GoogleApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: GoogleApiErrorCode; message: string } }

function failure(code: GoogleApiErrorCode, message: string): GoogleApiResult<never> {
  return { ok: false, error: { code, message } }
}

/**
 * Duck-types the HTTP status off a thrown error rather than `instanceof
 * GaxiosError` — this code doesn't depend on `gaxios` directly, and an
 * `instanceof` check can silently fail if npm resolves a second copy of it
 * nested under a dependency. Works the same for gaxios and Clerk SDK errors,
 * both of which expose `.status` and/or `.response.status`.
 */
function getHttpStatus(err: unknown): number | undefined {
  if (typeof err !== "object" || err === null) return undefined
  const withStatus = err as { status?: unknown; response?: { status?: unknown } }
  if (typeof withStatus.status === "number") return withStatus.status
  if (typeof withStatus.response?.status === "number") return withStatus.response.status
  return undefined
}

function getGoogleErrorReason(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined
  const withData = err as {
    response?: { data?: { error?: { errors?: { reason?: string }[] } } }
  }
  return withData.response?.data?.error?.errors?.[0]?.reason
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return "Unknown error"
}

/**
 * Fast pre-check against our own cached ConnectedAccount — skips even
 * attempting a Clerk/Google round-trip when we already know there's
 * nothing to connect to. Never the sole basis for allowing a call; only
 * ever used to short-circuit the "obviously not connected" case.
 */
async function hasUsableGoogleConnection(internalUserId: string): Promise<boolean> {
  const cached = await getGoogleConnectedAccount(internalUserId)
  return !!cached && cached.status !== ConnectedAccountStatus.REVOKED
}

/**
 * Resolves an internal user's live, authorized Gmail/Calendar clients using
 * the access token Clerk manages (Phase 1) — this code never stores or
 * reads a Google credential itself.
 */
async function getAuthorizedGoogleClients(
  internalUserId: string
): Promise<GoogleApiResult<{ gmail: gmail_v1.Gmail; calendar: calendar_v3.Calendar }>> {
  if (!(await hasUsableGoogleConnection(internalUserId))) {
    return failure("NOT_CONNECTED", "No Google account connected")
  }

  const user = await db.user.findUnique({ where: { id: internalUserId } })
  if (!user) {
    return failure("NOT_CONNECTED", "User not found")
  }

  let accessToken: string | undefined
  try {
    const client = await clerkClient()
    const tokens = await client.users.getUserOauthAccessToken(user.clerkId, "google")
    accessToken = tokens.data[0]?.token
  } catch (err) {
    // Only a definite "not found" is safe to treat as "not connected" — any
    // other failure (Clerk outage, etc.) is a real provider error, not a
    // missing connection, and must not be mislabeled as one.
    if (getHttpStatus(err) !== 404) {
      return failure("PROVIDER_ERROR", getErrorMessage(err))
    }
    accessToken = undefined
  }

  if (!accessToken) {
    return failure("NOT_CONNECTED", "No Google account connected")
  }

  const authClient = new OAuth2Client()
  authClient.setCredentials({ access_token: accessToken })

  return {
    ok: true,
    data: {
      gmail: gmail({ version: "v1", auth: authClient }),
      calendar: calendar({ version: "v3", auth: authClient }),
    },
  }
}

/**
 * Runs one Google API call and maps any failure into the shared result
 * envelope — nothing in this integration layer lets a Google API error
 * propagate as a thrown exception past this boundary.
 */
async function runGoogleApiCall<T>(
  internalUserId: string,
  fn: () => Promise<{ data: T }>
): Promise<GoogleApiResult<T>> {
  try {
    const response = await fn()
    return { ok: true, data: response.data }
  } catch (err) {
    const status = getHttpStatus(err)
    const reason = getGoogleErrorReason(err)

    if (status === 401) {
      await markGoogleConnectionNeedsReauth(internalUserId)
      return failure(
        "NEEDS_REAUTH",
        "Google access was revoked or expired — reconnect your account."
      )
    }
    if (status === 403) {
      const isQuota =
        reason === "rateLimitExceeded" ||
        reason === "userRateLimitExceeded" ||
        reason === "quotaExceeded"
      return isQuota
        ? failure("RATE_LIMITED", "Google API quota exceeded — try again shortly.")
        : failure(
            "INSUFFICIENT_SCOPE",
            "Disala doesn't have permission for this — reconnect your Google account."
          )
    }
    if (status === 429) {
      return failure("RATE_LIMITED", "Google API quota exceeded — try again shortly.")
    }
    return failure("PROVIDER_ERROR", getErrorMessage(err))
  }
}

export type { GoogleApiResult, GoogleApiErrorCode }
export { getAuthorizedGoogleClients, runGoogleApiCall, hasUsableGoogleConnection }
