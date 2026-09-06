import { createServer } from "http"

import {
  startWhatsAppConnection,
  disconnectWhatsAppConnection,
  getRuntimeInfo,
} from "@/lib/integrations/whatsapp/client"

/**
 * A minimal, localhost-only HTTP surface the Next.js app's API routes call
 * to control the worker's live WhatsApp sockets (disala-17 decision #1) —
 * this process is the only thing that can hold those sockets. Bound to
 * 127.0.0.1 only, never proxied publicly, and intentionally thin: it's
 * process-to-process control, not a product API of its own.
 */

const DEFAULT_PORT = 4178

async function readJsonBody(req: import("http").IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"))
  } catch {
    return {}
  }
}

function startControlServer(port = Number(process.env.WHATSAPP_WORKER_PORT) || DEFAULT_PORT) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://internal")

    try {
      if (req.method === "POST" && url.pathname === "/connect") {
        const body = await readJsonBody(req)
        const connectionId = String(body.connectionId ?? "")
        const userId = String(body.userId ?? "")
        if (!connectionId || !userId) {
          res.writeHead(400).end(JSON.stringify({ error: "connectionId and userId are required" }))
          return
        }
        await startWhatsAppConnection(connectionId, userId)
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }))
        return
      }

      if (req.method === "GET" && url.pathname === "/runtime") {
        const connectionId = url.searchParams.get("connectionId") ?? ""
        const info = connectionId ? getRuntimeInfo(connectionId) : null
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify(info ?? { qrDataUrl: null, chats: [] }))
        return
      }

      if (req.method === "POST" && url.pathname === "/disconnect") {
        const body = await readJsonBody(req)
        const connectionId = String(body.connectionId ?? "")
        if (!connectionId) {
          res.writeHead(400).end(JSON.stringify({ error: "connectionId is required" }))
          return
        }
        await disconnectWhatsAppConnection(connectionId)
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }))
        return
      }

      res.writeHead(404).end()
    } catch (err) {
      res
        .writeHead(500, { "content-type": "application/json" })
        .end(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }))
    }
  })

  server.listen(port, "127.0.0.1", () => {
    console.log(`[whatsapp-worker] control server listening on 127.0.0.1:${port}`)
  })

  return server
}

export { startControlServer }
