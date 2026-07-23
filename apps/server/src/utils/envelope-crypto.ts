import { Buffer } from 'node:buffer'
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'

/**
 * AES-GCM authenticated additional data (AAD) bound to each ciphertext.
 *
 * Binding the model name + key entry id into AAD prevents blob-swap attacks:
 * an attacker with configKV write access could move a valid ciphertext from
 * one (model, key entry) slot to another, but the decrypt step verifies the
 * AAD context and rejects the move.
 */
export interface EnvelopeAad {
  modelName: string
  keyEntryId: string
}

interface CreateEnvelopeCryptoOptions {
  /** 32-byte master key (current). Required. */
  masterKey: Buffer
  /**
   * 32-byte previous master key (during rotation only).
   *
   * When set, decrypt first tries `masterKey`; on auth-tag failure it retries
   * with `previousMasterKey`. Encrypt always uses `masterKey`. After all stored
   * ciphertexts have been re-encrypted under the new key, remove the previous
   * one from env.
   */
  previousMasterKey?: Buffer
}

const VERSION_PREFIX = 'v1'
const HKDF_SALT = Buffer.from('llm-router-v1', 'utf8')
const HKDF_INFO = Buffer.from('provider-key-encryption', 'utf8')
const KEY_LEN = 32 // AES-256
const IV_LEN = 12 // AES-GCM 96-bit IV
const TAG_LEN = 16

function assertMasterKeyLength(label: string, key: Buffer): void {
  if (key.length !== KEY_LEN)
    throw new Error(`${label} must be exactly 32 bytes (got ${key.length})`)
}

function deriveAesKey(masterKey: Buffer): Buffer {
  // hkdfSync returns ArrayBuffer in Node — wrap in Buffer view.
  return Buffer.from(hkdfSync('sha256', masterKey, HKDF_SALT, HKDF_INFO, KEY_LEN))
}

function encodeAad(aad: EnvelopeAad): Buffer {
  // NOTICE:
  // Pipe separator is reserved — neither modelName nor keyEntryId is allowed
  // to contain '|' at the schema layer (configKV Valibot validation enforces).
  // This avoids parser ambiguity if someone tries to forge a (model, id) pair
  // by injecting a separator into a single field.
  return Buffer.from(`${aad.modelName}|${aad.keyEntryId}`, 'utf8')
}

/**
 * Envelope-encrypt and decrypt provider API keys for at-rest storage.
 *
 * Use when:
 * - Storing provider API keys (OpenRouter, Azure Speech, etc.) inside configKV.
 * - Anywhere a secret needs at-rest encryption with rotation support inside
 *   `apps/server`.
 *
 * Expects:
 * - `masterKey` is 32 random bytes, loaded once at boot from
 *   `LLM_ROUTER_MASTER_KEY` (base64-decoded).
 * - `previousMasterKey` is set only during a rotation window so already-stored
 *   ciphertexts can still be decrypted.
 * - Callers pass the same `EnvelopeAad` value at encrypt and decrypt time.
 *
 * Returns:
 * - `encryptKey(...)` → string in the format `v1.<iv>.<ct>.<tag>` (base64url parts).
 * - `decryptKey(...)` → `Buffer` holding the plaintext bytes. Callers should
 *   `buf.fill(0)` in a `finally` once the value is no longer needed so the
 *   plaintext does not linger across GC cycles.
 */
export function createEnvelopeCrypto(options: CreateEnvelopeCryptoOptions) {
  assertMasterKeyLength('masterKey', options.masterKey)
  if (options.previousMasterKey != null)
    assertMasterKeyLength('previousMasterKey', options.previousMasterKey)

  const currentAesKey = deriveAesKey(options.masterKey)
  const previousAesKey = options.previousMasterKey ? deriveAesKey(options.previousMasterKey) : undefined

  function encryptWith(aesKey: Buffer, plaintext: Buffer, aadBytes: Buffer): { iv: Buffer, ct: Buffer, tag: Buffer } {
    const iv = randomBytes(IV_LEN)
    const cipher = createCipheriv('aes-256-gcm', aesKey, iv, { authTagLength: TAG_LEN })
    cipher.setAAD(aadBytes, { plaintextLength: plaintext.length })
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const tag = cipher.getAuthTag()
    return { iv, ct, tag }
  }

  function decryptWith(aesKey: Buffer, iv: Buffer, ct: Buffer, tag: Buffer, aadBytes: Buffer): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', aesKey, iv, { authTagLength: TAG_LEN })
    decipher.setAAD(aadBytes, { plaintextLength: ct.length })
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ct), decipher.final()])
  }

  return {
    encryptKey(plaintext: string, aad: EnvelopeAad): string {
      const plaintextBytes = Buffer.from(plaintext, 'utf8')
      const aadBytes = encodeAad(aad)
      const { iv, ct, tag } = encryptWith(currentAesKey, plaintextBytes, aadBytes)
      return [
        VERSION_PREFIX,
        iv.toString('base64url'),
        ct.toString('base64url'),
        tag.toString('base64url'),
      ].join('.')
    },

    decryptKey(ciphertext: string, aad: EnvelopeAad): Buffer {
      const parts = ciphertext.split('.')
      if (parts.length !== 4)
        throw new Error(`invalid envelope ciphertext format: expected 4 parts, got ${parts.length}`)

      const [version, ivB64, ctB64, tagB64] = parts
      if (version !== VERSION_PREFIX)
        throw new Error(`unsupported envelope version: expected ${VERSION_PREFIX}, got ${version}`)

      const iv = Buffer.from(ivB64, 'base64url')
      const ct = Buffer.from(ctB64, 'base64url')
      const tag = Buffer.from(tagB64, 'base64url')
      const aadBytes = encodeAad(aad)

      try {
        return decryptWith(currentAesKey, iv, ct, tag, aadBytes)
      }
      catch (currentErr) {
        if (previousAesKey == null)
          throw currentErr

        // NOTICE:
        // Rotation fallback. AES-GCM auth-tag failure is the expected signal
        // that this ciphertext predates the current master key. We retry once
        // with the previous AES key derived from `LLM_ROUTER_MASTER_KEY_PREVIOUS`.
        // Both keys failing means the ciphertext is genuinely corrupt or
        // forged — surface the original (current-key) error so observability
        // attributes it to the active configuration, not the legacy one.
        try {
          return decryptWith(previousAesKey, iv, ct, tag, aadBytes)
        }
        catch {
          throw currentErr
        }
      }
    },
  }
}

export type EnvelopeCrypto = ReturnType<typeof createEnvelopeCrypto>

/**
 * Returns the first 8 hex characters of `SHA-256(plaintext)`. Used as
 * `airi.gen_ai.gateway.key.id` for OTel traces and metrics.
 *
 * Expects:
 * - `plaintext` is the raw secret. Never pass the encrypted ciphertext.
 *
 * Returns:
 * - 8 lowercase hex characters. Stable across processes for the same input.
 */
export function keyIdFromPlaintext(plaintext: string): string {
  return createHash('sha256').update(plaintext, 'utf8').digest('hex').slice(0, 8)
}
