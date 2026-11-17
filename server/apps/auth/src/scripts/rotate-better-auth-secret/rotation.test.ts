import type { SecretConfig } from 'better-auth/crypto'

import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto'
import { describe, expect, it } from 'vitest'

import { rotatePrivateKey } from './rotation'

const oldSecret = 'old-secret-old-secret-old-secret-01'
const newSecret = 'new-secret-new-secret-new-secret-02'
const privateJwk = JSON.stringify({ kty: 'OKP', crv: 'Ed25519', d: 'example', x: 'example' })

function secretConfig(entries: Array<[number, string]>, legacySecret?: string): SecretConfig {
  return { keys: new Map(entries), currentVersion: entries[0][0], legacySecret }
}

const rotated = secretConfig([[2, newSecret], [1, oldSecret]], oldSecret)

describe('rotatePrivateKey', () => {
  it('re-encrypts a bare-hex key under the current version', async () => {
    const stored = JSON.stringify(await symmetricEncrypt({ key: oldSecret, data: privateJwk }))

    const result = await rotatePrivateKey(rotated, stored)
    const ciphertext = JSON.parse(result.value)

    expect(result.state).toBe('previous')
    expect(ciphertext.startsWith('$ba$2$')).toBe(true)
    expect(await symmetricDecrypt({ key: secretConfig([[2, newSecret]]), data: ciphertext })).toBe(privateJwk)
  })

  it('re-encrypts a key from an older version', async () => {
    const stored = JSON.stringify(await symmetricEncrypt({ key: secretConfig([[1, oldSecret]]), data: privateJwk }))

    const result = await rotatePrivateKey(rotated, stored)

    expect(result.state).toBe('previous')
    expect(JSON.parse(result.value).startsWith('$ba$2$')).toBe(true)
  })

  it('keeps a key under the current version', async () => {
    const stored = JSON.stringify(await symmetricEncrypt({ key: rotated, data: privateJwk }))

    expect(await rotatePrivateKey(rotated, stored)).toEqual({ state: 'current', value: stored })
  })

  it('reports a key that no configured secret opens', async () => {
    const stored = JSON.stringify(await symmetricEncrypt({ key: 'unknown-secret-unknown-secret-0003', data: privateJwk }))

    expect(await rotatePrivateKey(rotated, stored)).toEqual({ state: 'unreadable', value: stored })
  })

  it('reports a bare-hex key as unreadable without a legacy secret', async () => {
    const stored = JSON.stringify(await symmetricEncrypt({ key: oldSecret, data: privateJwk }))

    expect((await rotatePrivateKey(secretConfig([[2, newSecret]]), stored)).state).toBe('unreadable')
  })

  it('reports a key stored without encryption', async () => {
    expect(await rotatePrivateKey(rotated, privateJwk)).toEqual({ state: 'not-encrypted', value: privateJwk })
  })
})
