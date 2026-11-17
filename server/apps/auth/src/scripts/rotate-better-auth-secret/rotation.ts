import type { SecretConfig } from 'better-auth/crypto'

import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto'
import { parseJson, pipe, safeParse, string } from 'valibot'

/** Which secret can open one stored JWKS private key. */
export type PrivateKeyState = 'current' | 'previous' | 'unreadable' | 'not-encrypted'

export interface RotatedPrivateKey {
  state: PrivateKeyState
  /** The `jwks.private_key` value to store. It differs from the input only when `state` is `previous`. */
  value: string
}

// The jwt plugin stores an encrypted private key as a JSON string literal.
// See better-auth `dist/plugins/jwt/utils.mjs` `createJwk`.
const EncryptedPrivateKeySchema = pipe(string(), parseJson(), string())

/**
 * Re-encrypts one `jwks.private_key` value under the current versioned secret.
 *
 * Use when:
 * - `BETTER_AUTH_SECRETS` names a new current secret, and the old secret is a later entry or `BETTER_AUTH_SECRET`.
 *
 * Expects:
 * - `secretConfig` is the versioned config that Better Auth built from the same environment.
 *
 * Returns:
 * - The value to store and the state of the input value.
 */
export async function rotatePrivateKey(secretConfig: SecretConfig, stored: string): Promise<RotatedPrivateKey> {
  const parsed = safeParse(EncryptedPrivateKeySchema, stored)
  if (!parsed.success)
    return { state: 'not-encrypted', value: stored }

  let plaintext: string
  try {
    plaintext = await symmetricDecrypt({ key: secretConfig, data: parsed.output })
  }
  catch {
    return { state: 'unreadable', value: stored }
  }

  if (parsed.output.startsWith(`$ba$${secretConfig.currentVersion}$`))
    return { state: 'current', value: stored }

  const ciphertext = await symmetricEncrypt({ key: secretConfig, data: plaintext })
  return { state: 'previous', value: JSON.stringify(ciphertext) }
}
