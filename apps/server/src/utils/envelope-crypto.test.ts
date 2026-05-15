import { randomBytes } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { createEnvelopeCrypto, keyIdFromPlaintext } from './envelope-crypto'

function freshMasterKey(): Buffer {
  return randomBytes(32)
}

const exampleAad = { modelName: 'chat-default', keyEntryId: 'openrouter-prod-1' }

describe('createEnvelopeCrypto', () => {
  it('encrypt → decrypt round-trip returns original plaintext', () => {
    const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
    const plaintext = 'sk-or-v1-abcd1234abcd1234abcd1234abcd1234'

    const ct = crypto.encryptKey(plaintext, exampleAad)
    const decrypted = crypto.decryptKey(ct, exampleAad)

    expect(decrypted.toString('utf8')).toBe(plaintext)
  })

  it('encrypting same plaintext twice produces different ciphertext (IV randomness)', () => {
    const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
    const plaintext = 'sk-or-v1-abcd1234abcd1234'

    const ct1 = crypto.encryptKey(plaintext, exampleAad)
    const ct2 = crypto.encryptKey(plaintext, exampleAad)

    expect(ct1).not.toBe(ct2)
  })

  it('ciphertext format is v1.<iv>.<ct>.<tag> with 4 parts', () => {
    const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
    const ct = crypto.encryptKey('any-key', exampleAad)

    const parts = ct.split('.')
    expect(parts[0]).toBe('v1')
    expect(parts).toHaveLength(4)
    // iv is 96 bits = 12 bytes = 16 base64 chars
    expect(parts[1].length).toBeGreaterThan(0)
    // ct is non-empty
    expect(parts[2].length).toBeGreaterThan(0)
    // tag is 128 bits = 16 bytes = 24 base64 chars (with padding); base64url removes '='
    expect(parts[3].length).toBeGreaterThan(0)
  })

  it('decrypting tampered ciphertext throws auth-tag verification error', () => {
    const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
    const ct = crypto.encryptKey('sk-tamper-me', exampleAad)

    // Flip one byte mid-ct portion
    const parts = ct.split('.')
    const ctBytes = Buffer.from(parts[2], 'base64url')
    ctBytes[0] = ctBytes[0] ^ 0xFF
    parts[2] = ctBytes.toString('base64url')
    const tampered = parts.join('.')

    expect(() => crypto.decryptKey(tampered, exampleAad)).toThrow(/auth/i)
  })

  it('decrypting with tampered auth tag throws', () => {
    const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
    const ct = crypto.encryptKey('sk-some-key', exampleAad)

    const parts = ct.split('.')
    const tagBytes = Buffer.from(parts[3], 'base64url')
    tagBytes[0] = tagBytes[0] ^ 0xFF
    parts[3] = tagBytes.toString('base64url')
    const tampered = parts.join('.')

    expect(() => crypto.decryptKey(tampered, exampleAad)).toThrow(/auth/i)
  })

  it('decrypting with wrong AAD throws auth-tag verification error (AAD binding)', () => {
    const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
    const ct = crypto.encryptKey('sk-bound', exampleAad)

    expect(() => crypto.decryptKey(ct, { modelName: 'different-model', keyEntryId: exampleAad.keyEntryId })).toThrow(/auth/i)
    expect(() => crypto.decryptKey(ct, { modelName: exampleAad.modelName, keyEntryId: 'different-entry' })).toThrow(/auth/i)
  })

  it('encrypts empty string and decrypts back to empty', () => {
    const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
    const ct = crypto.encryptKey('', exampleAad)
    const decrypted = crypto.decryptKey(ct, exampleAad)
    expect(decrypted.toString('utf8')).toBe('')
  })

  it('decrypting truncated ciphertext throws explicit format error', () => {
    const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
    expect(() => crypto.decryptKey('v1.short', exampleAad)).toThrow(/format|invalid|parts/i)
    expect(() => crypto.decryptKey('', exampleAad)).toThrow(/format|invalid|parts/i)
  })

  it('decrypting wrong-version prefix throws', () => {
    const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
    const ct = crypto.encryptKey('sk-x', exampleAad)
    const wrongVersion = ct.replace(/^v1\./, 'v9.')
    expect(() => crypto.decryptKey(wrongVersion, exampleAad)).toThrow(/version|v1/i)
  })

  it('decrypting with rotated master key uses previousMasterKey on auth-tag failure', () => {
    const oldKey = freshMasterKey()
    const newKey = freshMasterKey()

    // Encrypted under old key
    const cryptoOld = createEnvelopeCrypto({ masterKey: oldKey })
    const ct = cryptoOld.encryptKey('sk-rotating', exampleAad)

    // After rotation: new key is current, old is previous
    const cryptoRotating = createEnvelopeCrypto({ masterKey: newKey, previousMasterKey: oldKey })
    const decrypted = cryptoRotating.decryptKey(ct, exampleAad)

    expect(decrypted.toString('utf8')).toBe('sk-rotating')
  })

  it('returns Buffer (not string) so caller can fill(0) after use', () => {
    const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
    const ct = crypto.encryptKey('sk-zero-me', exampleAad)
    const decrypted = crypto.decryptKey(ct, exampleAad)

    expect(Buffer.isBuffer(decrypted)).toBe(true)
    // Caller's responsibility: zero after use to reduce heap exposure
    decrypted.fill(0)
    expect(decrypted.every(b => b === 0)).toBe(true)
  })

  it('rejects master key of wrong byte length at construction', () => {
    expect(() => createEnvelopeCrypto({ masterKey: Buffer.alloc(31) })).toThrow(/32 bytes/)
    expect(() => createEnvelopeCrypto({ masterKey: Buffer.alloc(33) })).toThrow(/32 bytes/)
  })

  it('rejects previousMasterKey of wrong byte length at construction', () => {
    expect(() => createEnvelopeCrypto({
      masterKey: freshMasterKey(),
      previousMasterKey: Buffer.alloc(16),
    })).toThrow(/32 bytes/)
  })
})

describe('keyIdFromPlaintext', () => {
  it('returns first 8 hex chars of SHA-256(plaintext)', () => {
    // Deterministic value: SHA-256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(keyIdFromPlaintext('hello')).toBe('2cf24dba')
  })

  it('returns different ids for different plaintexts', () => {
    expect(keyIdFromPlaintext('sk-1')).not.toBe(keyIdFromPlaintext('sk-2'))
  })

  it('returns same id for same plaintext (deterministic)', () => {
    expect(keyIdFromPlaintext('stable-input')).toBe(keyIdFromPlaintext('stable-input'))
  })
})
