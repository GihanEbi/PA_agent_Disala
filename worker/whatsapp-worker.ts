import "./load-env"

import { resumeAllConnections } from "@/lib/integrations/whatsapp/client"
import { pruneExpiredWhatsAppMessages } from "@/lib/integrations/whatsapp/retention"
import { startControlServer } from "./whatsapp-control"

/**
 * Standalone, always-on entrypoint for the WhatsApp integration
 * (disala-17 decision #1) — run separately from the Next.js app via
 * `npm run whatsapp:worker`. Next.js never imports lib/integrations/whatsapp/client.ts
 * directly; it only reaches this process through whatsapp-control.ts.
 */

const PRUNE_INTERVAL_MS = 60 * 60 * 1000 // hourly

// Last line of defense: this process holds every connected user's live
// socket, so one unhandled rejection anywhere (a missed .catch() in this
// codebase, or inside Baileys itself) must never take all of them down —
// Node terminates the process on an unhandled rejection by default.
process.on("unhandledRejection", (err) => {
  console.error("[whatsapp-worker] unhandled rejection (ignored, process stays up)", err)
})

async function main() {
  await resumeAllConnections()
  startControlServer()

  setInterval(() => {
    pruneExpiredWhatsAppMessages().catch((err) =>
      console.error("[whatsapp-worker] retention pruning failed", err)
    )
  }, PRUNE_INTERVAL_MS)

  console.log("[whatsapp-worker] ready")
}

main().catch((err) => {
  console.error("[whatsapp-worker] fatal startup error", err)
  process.exit(1)
})
