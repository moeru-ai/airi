import type { Buffer } from 'node:buffer'

import type { Counter } from '@opentelemetry/api'

import type { GatewayMetrics } from '../../../../otel'

import { randomBytes } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import { createEnvelopeCrypto } from '../../../../utils/envelope-crypto'
import { ApiError } from '../../../../utils/error'
import { createKeyRotator } from '../key-rotator'

function freshMasterKey(): Buffer {
  return randomBytes(32)
}

function makeCounter(): Counter {
  return { add: vi.fn() } as unknown as Counter
}

function makeMetrics(): { metrics: GatewayMetrics, decryptFailures: Counter } {
  const decryptFailures = makeCounter()
  // We only exercise decryptFailures here; the rest are unused stubs.
  const metrics = {
    fallbackCount: makeCounter(),
    upstreamErrors: makeCounter(),
    keyExhaustedCount: makeCounter(),
    sameStatusExhaustion: makeCounter(),
    configReload: makeCounter(),
    decryptFailures,
    subscriberState: makeCounter(),
    configWrite: makeCounter(),
    configInvalidHmac: makeCounter(),
  } as GatewayMetrics
  return { metrics, decryptFailures }
}

describe('createKeyRotator', () => {
  /**
   * @example iterator yields {id, plaintext} for each key in config order
   */
  it('yields keys in config order with decrypted plaintext', () => {
    const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
    const modelName = 'openai/gpt-5-mini'
    const upstream = {
      keys: [
        { id: 'k1', ciphertext: crypto.encryptKey('sk-key-one', { modelName, keyEntryId: 'k1' }) },
        { id: 'k2', ciphertext: crypto.encryptKey('sk-key-two', { modelName, keyEntryId: 'k2' }) },
        { id: 'k3', ciphertext: crypto.encryptKey('sk-key-three', { modelName, keyEntryId: 'k3' }) },
      ],
    }
    const { metrics } = makeMetrics()

    const rotator = createKeyRotator(upstream, crypto, modelName, metrics, 'openrouter')
    const collected: { id: string, secret: string }[] = []
    for (const entry of rotator) {
      collected.push({ id: entry.id, secret: entry.plaintext.toString('utf8') })
      entry.plaintext.fill(0)
    }

    expect(collected).toHaveLength(3)
    expect(collected[0]).toEqual({ id: 'k1', secret: 'sk-key-one' })
    expect(collected[1]).toEqual({ id: 'k2', secret: 'sk-key-two' })
    expect(collected[2]).toEqual({ id: 'k3', secret: 'sk-key-three' })
  })

  it('iterator stops after final key (no extra yields)', () => {
    const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
    const modelName = 'm'
    const upstream = {
      keys: [{ id: 'only', ciphertext: crypto.encryptKey('sk-only', { modelName, keyEntryId: 'only' }) }],
    }
    const { metrics } = makeMetrics()

    const it1 = createKeyRotator(upstream, crypto, modelName, metrics, 'p')[Symbol.iterator]()
    const first = it1.next()
    const second = it1.next()

    expect(first.done).toBe(false)
    expect(first.value?.id).toBe('only')
    expect(second.done).toBe(true)
  })

  it('decrypt failure throws DECRYPT_FAILED (503) and increments decryptFailures counter — does NOT silently skip', () => {
    // ROOT CAUSE:
    //
    // If a stored ciphertext is corrupted or AAD-forged, decryptKey throws.
    // Silently skipping that key would mask config-poisoning attempts (an
    // attacker with configKV write access could overwrite a valid blob with
    // a junk blob to force the router to fall back). Per plan U3 test (3)
    // we surface as 503 DECRYPT_FAILED and increment the metric.
    const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
    const modelName = 'm'
    const upstream = {
      keys: [
        { id: 'bad', ciphertext: 'v1.AAAA.BBBB.CCCC' },
      ],
    }
    const { metrics, decryptFailures } = makeMetrics()

    const rotator = createKeyRotator(upstream, crypto, modelName, metrics, 'openrouter')

    expect(() => {
      for (const _ of rotator) {
        // unreachable on the first key
      }
    }).toThrow(ApiError)

    try {
      for (const _ of rotator) {
        // re-walk so we can inspect the thrown ApiError details
      }
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).statusCode).toBe(503)
      expect((err as ApiError).errorCode).toBe('DECRYPT_FAILED')
      expect((err as ApiError).details).toMatchObject({ keyEntryId: 'bad', modelName: 'm' })
    }

    // Counter incremented twice (we walked the iterator twice above).
    expect((decryptFailures.add as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1)
    const firstCall = (decryptFailures.add as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(firstCall[0]).toBe(1)
    expect(firstCall[1]).toEqual({ provider: 'openrouter', key_entry_id: 'bad' })
  })

  it('decrypt failure on a later key still aborts iteration immediately (no partial yields)', () => {
    const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
    const modelName = 'm'
    const upstream = {
      keys: [
        { id: 'k1', ciphertext: crypto.encryptKey('sk-good', { modelName, keyEntryId: 'k1' }) },
        { id: 'bad', ciphertext: 'v1.AAAA.BBBB.CCCC' },
      ],
    }
    const { metrics } = makeMetrics()

    const rotator = createKeyRotator(upstream, crypto, modelName, metrics, 'openrouter')
    const collected: string[] = []
    expect(() => {
      for (const entry of rotator) {
        collected.push(entry.id)
        entry.plaintext.fill(0)
      }
    }).toThrow(/DECRYPT_FAILED|Failed to decrypt/)

    expect(collected).toEqual(['k1'])
  })

  it('tolerates null gatewayMetrics (OTel disabled) without throwing', () => {
    const crypto = createEnvelopeCrypto({ masterKey: freshMasterKey() })
    const modelName = 'm'
    const upstream = {
      keys: [{ id: 'k1', ciphertext: crypto.encryptKey('sk-x', { modelName, keyEntryId: 'k1' }) }],
    }

    const rotator = createKeyRotator(upstream, crypto, modelName, null, 'openrouter')
    const first = rotator[Symbol.iterator]().next()
    expect(first.value?.id).toBe('k1')
    expect(first.value?.plaintext.toString('utf8')).toBe('sk-x')
  })
})
