"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useUser, useReverification } from "@clerk/nextjs"
import type {
  CreateExternalAccountParams,
  ExternalAccountResource,
} from "@clerk/nextjs/types"
import { PlugZap } from "lucide-react"

import { Icon } from "@/components/disala/icon"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { GOOGLE_OAUTH_SCOPES } from "@/lib/google-oauth"
import { syncConnectedAccountsAction } from "@/app/settings/connections/actions"

const CONNECTIONS_PATH = "/settings/connections"

function GoogleConnectionCard() {
  const router = useRouter()
  const { isLoaded, user } = useUser()
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const createExternalAccount = useReverification((params: CreateExternalAccountParams) =>
    user?.createExternalAccount(params)
  )
  const reauthorizeAccount = useReverification((account: ExternalAccountResource) =>
    account.reauthorize({
      redirectUrl: CONNECTIONS_PATH,
      additionalScopes: [...GOOGLE_OAUTH_SCOPES],
    })
  )
  const destroyAccount = useReverification((account: ExternalAccountResource) => account.destroy())

  async function handleConnect() {
    setError(null)
    try {
      const result = await createExternalAccount({
        strategy: "oauth_google",
        redirectUrl: CONNECTIONS_PATH,
        additionalScopes: [...GOOGLE_OAUTH_SCOPES],
      })
      if (result?.verification?.externalVerificationRedirectURL) {
        router.push(result.verification.externalVerificationRedirectURL.href)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the Google connection.")
    }
  }

  async function handleReauthorize(account: ExternalAccountResource) {
    setError(null)
    try {
      const result = await reauthorizeAccount(account)
      if (result?.verification?.externalVerificationRedirectURL) {
        router.push(result.verification.externalVerificationRedirectURL.href)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reconnect Google.")
    }
  }

  async function handleDisconnect(account: ExternalAccountResource) {
    setError(null)
    try {
      await destroyAccount(account)
      await syncConnectedAccountsAction()
      startTransition(() => router.refresh())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't disconnect Google.")
    }
  }

  if (!isLoaded) {
    return (
      <div className="rounded-md bg-card p-4 text-sm text-neutral-300">
        Loading connection status…
      </div>
    )
  }

  const googleAccount = user?.externalAccounts.find(
    (account) => account.provider === "google"
  )
  const isVerified = googleAccount?.verification?.status === "verified"

  return (
    <div className="flex flex-col gap-3 rounded-md bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-700">
            <Icon icon={PlugZap} size={20} />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="font-display text-base font-medium text-foreground">Google</p>
            <p className="text-sm text-neutral-300">
              Gmail search, read, draft, send · Calendar read, create, update, cancel
            </p>
          </div>
        </div>
        {!googleAccount ? (
          <Badge variant="neutral">Not connected</Badge>
        ) : isVerified ? (
          <Badge variant="resolved">Connected</Badge>
        ) : (
          <Badge variant="attention">Needs reconnect</Badge>
        )}
      </div>

      {googleAccount ? (
        <p className="text-sm text-neutral-300">Connected as {googleAccount.emailAddress}</p>
      ) : null}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      <div className="flex gap-3">
        {!googleAccount ? (
          <Button variant="primary" onClick={handleConnect} disabled={isPending}>
            Connect Google
          </Button>
        ) : (
          <>
            {!isVerified ? (
              <Button
                variant="primary"
                onClick={() => handleReauthorize(googleAccount)}
                disabled={isPending}
              >
                Reconnect
              </Button>
            ) : (
              <Button
                variant="text"
                onClick={() => handleReauthorize(googleAccount)}
                disabled={isPending}
              >
                Reconnect
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => handleDisconnect(googleAccount)}
              disabled={isPending}
            >
              Disconnect
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

export { GoogleConnectionCard }
