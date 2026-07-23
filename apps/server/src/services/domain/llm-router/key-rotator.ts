import type { Buffer } from 'node:buffer'

import type { GatewayMetrics } from '../../../otel'
import type { EnvelopeCrypto } from '../../../utils/envelope-crypto'

import { errorMessageFrom } from '@moeru/std'

import { createServiceUnavailableError } from '../../../utils/error'

/**
 * Minimal shape of one upstream as needed by the rotator. We do not depend
 * on the inferred `LlmUpstream` / `TtsUpstream` types directly here so the
 * same rotator works for both surfaces without a union split — both surfaces
 * carry `keys` + each key has `id` + `ciphertext`.
 */
export interface RotatableUpstream {
  keys: ReadonlyArray<{ id: string, ciphertext: string }>
}

/**
 * One yielded key entry. `plaintext` is a {@link Buffer} so the caller can
 * `buf.fill(0)` after use to wipe the secret from memory promptly.
 */
export interface RotatedKey {
  /** Stable key id from the config entry — safe for OTel labels. */
  id: string
  /**
   * Decrypted plaintext key bytes. The caller is expected to wipe this with
   * `plaintext.fill(0)` in a `finally` once the request attempt finishes.
   */
  plaintext: Buffer
}

/**
 * Build a per-request iterator over decrypted keys for one upstream.
 *
 * Use when:
 * - The router needs to walk an upstream's `keys[]` in order, decrypting
 *   each only when it's actually about to be used.
 *
 * Expects:
 * - `upstream.keys` is non-empty (configKV Valibot enforces this).
 * - `modelName` matches the AAD the keys were encrypted under. A mismatch
 *   surfaces as a decrypt failure (AAD binding — see envelope-crypto.ts).
 * - `gatewayMetrics` may be `null` when OTel is disabled.
 *
 * Returns:
 * - An iterable that yields `{id, plaintext: Buffer}` per key in config
 *   order. On decrypt failure it throws `createServiceUnavailableError`
 *   immediately (does NOT silently skip — silent skip would hide config
 *   poisoning attempts).
 */
export function createKeyRotator(
  upstream: RotatableUpstream,
  envelopeCrypto: EnvelopeCrypto,
  modelName: string,
  gatewayMetrics: GatewayMetrics | null,
  provider: string,
): Iterable<RotatedKey> {
  return {
    * [Symbol.iterator](): Iterator<RotatedKey> {
      for (const entry of upstream.keys) {
        let plaintext: Buffer
        try {
          plaintext = envelopeCrypto.decryptKey(entry.ciphertext, {
            modelName,
            keyEntryId: entry.id,
          })
        }
        catch (err) {
          gatewayMetrics?.decryptFailures.add(1, {
            provider,
            key_entry_id: entry.id,
          })
          // NOTICE:
          // Surfacing decrypt failure as CONFIG_NOT_SET (503) rather than
          // letting the raw crypto error bubble. Silent skip would hide
          // config poisoning / forged-blob attempts. Source: plan U3 test
          // scenario (3) "Decrypt failure on one key … does NOT silently
          // skip (security: silent skip would hide config-poisoning)".
          // Removal condition: never — security-critical surfacing.
          throw createServiceUnavailableError(
            `Failed to decrypt key ${entry.id} for model ${modelName}: ${errorMessageFrom(err) ?? 'unknown error'}`,
            'DECRYPT_FAILED',
            { keyEntryId: entry.id, modelName },
          )
        }
        yield { id: entry.id, plaintext }
      }
    },
  }
}
