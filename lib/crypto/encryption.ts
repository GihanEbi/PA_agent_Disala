// Worker-only (used by lib/integrations/whatsapp/auth-store.ts) — no
// `import "server-only"`; that guard throws unconditionally outside Next's
// server bundler, which would break the standalone worker process.
import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12

/**
 * The first credential this codebase itself has to hold — Google's tokens
 * live in Clerk (see lib/integrations/google-client.ts), never here. A
 * WhatsApp companion-device session is equivalent in sensitivity to an
 * OAuth refresh token (full read access to the linked account), so it's
 * never stored in plaintext. Key must be a base64-encoded 32-byte value,
 * e.g. generated once via: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
function getKey(): Buffer {
  const raw = process.env.WHATSAPP_SESSION_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      "WHATSAPP_SESSION_ENCRYPTION_KEY is not set — required to store WhatsApp session credentials securely."
    )
  }
  const key = Buffer.from(raw, "base64")
  if (key.length !== 32) {
    throw new Error(
      "WHATSAPP_SESSION_ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded AES-256 key)."
    )
  }
  return key
}

/** AES-256-GCM encrypt. Output format: base64(iv).base64(authTag).base64(ciphertext). */
function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv, authTag, ciphertext].map((buf) => buf.toString("base64")).join(".")
}

function decrypt(payload: string): string {
  const key = getKey()
  const [ivB64, authTagB64, ciphertextB64] = payload.split(".")
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted payload")
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"))
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ])
  return plaintext.toString("utf8")
}

export { encrypt, decrypt }
