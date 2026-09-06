"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { MessageCircle } from "lucide-react"

import { Icon } from "@/components/disala/icon"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type StatusResponse = {
  status: "PENDING_QR" | "CONNECTED" | "DISCONNECTED" | "ERROR" | null
  phoneNumber: string | null
  qrDataUrl: string | null
  stale: boolean
}

type SyncedChat = { chatJid: string; chatName: string | null; syncing: boolean }

const POLL_MS = 2500

/**
 * Experimental, opt-in WhatsApp read-only connection — unlike Google, this
 * is unofficial (no OAuth), needs a QR scan against a real phone number, and
 * carries real ban risk the user must explicitly accept before linking
 * (prompts/disala-17-whatsapp-readonly-integration.md decision #8).
 */
function WhatsAppConnectionCard() {
  const router = useRouter()
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [riskAccepted, setRiskAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [chats, setChats] = useState<SyncedChat[] | null>(null)

  const refreshStatus = useCallback(async () => {
    const res = await fetch("/api/whatsapp/status", { cache: "no-store" })
    if (!res.ok) return
    setStatus(await res.json())
  }, [])

  // Always fetch on mount, then keep polling only while a QR scan is
  // pending (the one state that changes without the user taking an action).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const res = await fetch("/api/whatsapp/status", { cache: "no-store" })
      if (!res.ok || cancelled) return
      const data = await res.json()
      if (!cancelled) setStatus(data)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (status?.status !== "PENDING_QR") return
    const interval = setInterval(refreshStatus, POLL_MS)
    return () => clearInterval(interval)
  }, [status?.status, refreshStatus])

  useEffect(() => {
    if (status?.status !== "CONNECTED") return
    let cancelled = false
    void (async () => {
      const res = await fetch("/api/whatsapp/chats", { cache: "no-store" })
      if (!res.ok || cancelled) return
      const data = await res.json()
      if (!cancelled) setChats(data.chats)
    })()
    return () => {
      cancelled = true
    }
  }, [status?.status])

  async function handleConnect() {
    setError(null)
    setIsBusy(true)
    try {
      const res = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ riskAcknowledged: riskAccepted }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Couldn't start the WhatsApp connection.")
        return
      }
      await refreshStatus()
    } catch {
      setError("Couldn't start the WhatsApp connection.")
    } finally {
      setIsBusy(false)
    }
  }

  async function handleDisconnect() {
    setError(null)
    setIsBusy(true)
    try {
      const res = await fetch("/api/whatsapp/disconnect", { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Couldn't disconnect WhatsApp.")
        return
      }
      setChats(null)
      router.refresh()
      await refreshStatus()
    } catch {
      setError("Couldn't disconnect WhatsApp.")
    } finally {
      setIsBusy(false)
    }
  }

  async function toggleChat(chatJid: string, chatName: string | null, syncing: boolean) {
    setChats((prev) =>
      prev ? prev.map((c) => (c.chatJid === chatJid ? { ...c, syncing } : c)) : prev
    )
    await fetch("/api/whatsapp/chats", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chatJid, chatName, syncing }),
    }).catch(() => {})
  }

  const connected = status?.status === "CONNECTED"
  const pendingQr = status?.status === "PENDING_QR"

  return (
    <div className="flex flex-col gap-3 rounded-md bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-neutral-700">
            <Icon icon={MessageCircle} size={20} />
          </span>
          <div className="flex flex-col gap-0.5">
            <p className="font-display text-base font-medium text-foreground">WhatsApp</p>
            <p className="text-sm text-neutral-300">Read-only summaries · experimental, unofficial</p>
          </div>
        </div>
        {!status?.status || status.status === "DISCONNECTED" ? (
          <Badge variant="neutral">Not connected</Badge>
        ) : connected ? (
          <Badge variant={status.stale ? "attention" : "resolved"}>
            {status.stale ? "Reconnecting…" : "Connected"}
          </Badge>
        ) : pendingQr ? (
          <Badge variant="schedule">Scan QR</Badge>
        ) : (
          <Badge variant="attention">Error</Badge>
        )}
      </div>

      {connected && status.phoneNumber ? (
        <p className="text-sm text-neutral-300">Linked as +{status.phoneNumber}</p>
      ) : null}

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {!status?.status || status.status === "DISCONNECTED" || status.status === "ERROR" ? (
        <>
          <div className="rounded-md border border-gold-500/30 bg-gold-500/10 p-3 text-sm text-neutral-200">
            <p className="font-medium text-gold-300">Before you connect</p>
            <p className="mt-1">
              There is no official way to read a personal WhatsApp account. This links your phone
              as a companion device using an unofficial library — WhatsApp could ban the linked
              number at any time, without warning. Disala can&apos;t prevent or appeal that. Use a
              number you&apos;re comfortable putting at risk, not your primary one.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={riskAccepted}
              onChange={(e) => setRiskAccepted(e.target.checked)}
              className="mt-0.5"
            />
            I understand the risk and want to connect my WhatsApp anyway.
          </label>
          <div>
            <Button
              variant="primary"
              onClick={handleConnect}
              disabled={isBusy || !riskAccepted}
            >
              Connect WhatsApp
            </Button>
          </div>
        </>
      ) : null}

      {pendingQr ? (
        <div className="flex flex-col items-center gap-2 rounded-md bg-neutral-800 p-4">
          {status.qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={status.qrDataUrl} alt="WhatsApp linking QR code" className="size-48" />
          ) : (
            <p className="text-sm text-neutral-300">Waiting for the connector to generate a QR code…</p>
          )}
          <p className="text-center text-sm text-neutral-300">
            Open WhatsApp on your phone → Linked Devices → Link a Device, then scan this code.
          </p>
        </div>
      ) : null}

      {connected ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">Synced chats</p>
          <p className="text-sm text-neutral-300">
            Only 1:1 chats you turn on here are read. New chats appear once they receive a message
            while the connector is running.
          </p>
          {chats && chats.length > 0 ? (
            <div className="flex flex-col gap-1">
              {chats.map((chat) => (
                <label key={chat.chatJid} className="flex items-center gap-2 text-sm text-neutral-200">
                  <input
                    type="checkbox"
                    checked={chat.syncing}
                    onChange={(e) => toggleChat(chat.chatJid, chat.chatName, e.target.checked)}
                  />
                  {chat.chatName ?? chat.chatJid}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-neutral-400">No chats discovered yet.</p>
          )}
        </div>
      ) : null}

      {status?.status && status.status !== "DISCONNECTED" ? (
        <div className="flex gap-3">
          <Button variant="secondary" onClick={handleDisconnect} disabled={isBusy}>
            Disconnect
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export { WhatsAppConnectionCard }
