// Loads env vars before anything else in the worker's module graph runs.
// This MUST be its own module, imported first via a bare `import
// "./load-env"` with no other statements sharing that import line in
// whatsapp-worker.ts. ES modules evaluate all of a file's imports, in
// order, before running any of that file's own top-level statements — so
// interleaving `loadEnv()` calls directly between `import` lines in
// whatsapp-worker.ts (an earlier version of this file did that) silently
// runs them AFTER every import already evaluated, including
// lib/db.ts's PrismaPg construction, which reads DATABASE_URL immediately
// at import time. Isolating the side effect in its own single-import
// module makes it a normal, self-contained import evaluated to completion
// before the next sibling import in whatsapp-worker.ts.
//
// Plain `dotenv/config` alone isn't enough either: it only loads `.env`,
// not Next.js's `.env.local` convention, which is where this project's
// other secrets (Clerk, OpenAI, and now WHATSAPP_SESSION_ENCRYPTION_KEY)
// already live.
import { config as loadEnv } from "dotenv"

loadEnv({ path: ".env.local" })
loadEnv({ path: ".env" })
