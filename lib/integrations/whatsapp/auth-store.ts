// Worker-only, like client.ts — no `import "server-only"` (see its comment).
import {
  initAuthCreds,
  makeCacheableSignalKeyStore,
  BufferJSON,
  proto,
} from "@whiskeysockets/baileys"
import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
} from "@whiskeysockets/baileys"
import type { Logger } from "pino"

import { db } from "@/lib/db"
import { encrypt, decrypt } from "@/lib/crypto/encryption"

type StoredKeys = { [category: string]: { [id: string]: unknown } }
type StoredSession = { creds: AuthenticationCreds; keys: StoredKeys }

async function readStoredSession(connectionId: string): Promise<StoredSession | null> {
  const row = await db.whatsAppConnection.findUnique({
    where: { id: connectionId },
    select: { sessionState: true },
  })
  const wrapper = row?.sessionState as { enc?: string } | null
  if (!wrapper?.enc) return null
  const json = decrypt(wrapper.enc)
  return JSON.parse(json, BufferJSON.reviver) as StoredSession
}

async function writeStoredSession(connectionId: string, session: StoredSession): Promise<void> {
  const json = JSON.stringify(session, BufferJSON.replacer)
  await db.whatsAppConnection.update({
    where: { id: connectionId },
    data: { sessionState: { enc: encrypt(json) } },
  })
}

/**
 * Implements Baileys' AuthenticationState contract backed by an encrypted
 * Postgres column, instead of useMultiFileAuthState's plaintext-folder
 * reference implementation (whose own source recommends "writing an auth
 * state for use with a proper SQL or No-SQL DB" for anything beyond a
 * throwaway bot — see prompts/disala-17, "Relevant skills"). The whole
 * session (creds + signal keys) is kept as one encrypted JSON blob — small
 * enough that per-key rows would only add complexity with no real benefit
 * here. Only ever imported by worker/ code, never by app/ route handlers.
 */
async function loadWhatsAppAuthState(
  connectionId: string,
  logger: Logger
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const stored = (await readStoredSession(connectionId)) ?? {
    creds: initAuthCreds(),
    keys: {},
  }
  const { creds, keys } = stored

  const persist = () => writeStoredSession(connectionId, { creds, keys })

  const keyStore = makeCacheableSignalKeyStore(
    {
      get: async (type, ids) => {
        const data: Record<string, SignalDataTypeMap[typeof type]> = {}
        for (const id of ids) {
          let value = keys[type]?.[id]
          if (value !== undefined && type === "app-state-sync-key") {
            value = proto.Message.AppStateSyncKeyData.fromObject(
              value as Record<string, unknown>
            )
          }
          if (value !== undefined) {
            data[id] = value as SignalDataTypeMap[typeof type]
          }
        }
        return data
      },
      set: async (data) => {
        for (const category of Object.keys(data) as (keyof SignalDataTypeMap)[]) {
          const categoryData = data[category]
          if (!categoryData) continue
          keys[category] ??= {}
          for (const id of Object.keys(categoryData)) {
            const value = categoryData[id]
            if (value === null || value === undefined) {
              delete keys[category][id]
            } else {
              keys[category][id] = value
            }
          }
        }
        await persist()
      },
    },
    logger
  )

  return {
    state: { creds, keys: keyStore },
    saveCreds: persist,
  }
}

export { loadWhatsAppAuthState }
