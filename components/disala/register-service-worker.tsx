"use client"

import { useEffect } from "react"

/**
 * Registered only in production — in `next dev` an active service worker
 * would fight Turbopack's own hot-reload/caching while iterating.
 */
function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (!("serviceWorker" in navigator)) return

    navigator.serviceWorker.register("/sw.js").catch(() => {})
  }, [])

  return null
}

export { RegisterServiceWorker }
