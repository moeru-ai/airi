import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { createEnvelopeCrypto } from '../../utils/envelope-crypto'
import { createEnvelopeRotation, rotateRouterConfig, rotateUnspeechUpstream } from './rotation'

const oldKey = Buffer.alloc(32, 0x11)
const newKey = Buffer.alloc(32, 0x22)
const otherKey = Buffer.alloc(32, 0x33)

const oldCrypto = createEnvelopeCrypto({ masterKey: oldKey })
const newCrypto = createEnvelopeCrypto({ masterKey: newKey })
const otherCrypto = createEnvelopeCrypto({ masterKey: otherKey })
const rotation = createEnvelopeRotation({ current: newCrypto, previous: oldCrypto })

const aad = { modelName: 'chat-model', keyEntryId: 'key-1' }

function routerConfig(keys: Record<string, string>) {
  return JSON.stringify({
    llm: {
      models: {
        'chat-model': {
          upstreams: [{ baseURL: 'https://example.com/v1', headers: { 'X-Title': 'AIRI' }, keys: [{ id: 'key-1', ciphertext: keys.llm }] }],
        },
      },
    },
    tts: {
      models: {
        'speech-model': {
          provider: 'azure',
          upstreams: [{ id: 'primary', baseURL: 'https://example.com/tts', keys: [{ id: 'key-2', ciphertext: keys.tts }] }],
        },
      },
    },
    defaults: { timeoutMs: 1000 },
  })
}

describe('createEnvelopeRotation', () => {
  it('re-encrypts a value that only the previous key opens', () => {
    const rotated = rotation.rotate(oldCrypto.encryptKey('sk-example', aad), aad)

    expect(rotated.state).toBe('previous')
    expect(newCrypto.decryptKey(rotated.ciphertext, aad).toString('utf8')).toBe('sk-example')
  })

  it('keeps a value that the current key already opens', () => {
    const ciphertext = newCrypto.encryptKey('sk-example', aad)

    expect(rotation.rotate(ciphertext, aad)).toEqual({ state: 'current', ciphertext })
  })

  it('reports a value that neither key opens and keeps it unchanged', () => {
    const ciphertext = otherCrypto.encryptKey('sk-example', aad)

    expect(rotation.rotate(ciphertext, aad)).toEqual({ state: 'unreadable', ciphertext })
  })

  it('reports a value under the wrong AAD as unreadable', () => {
    const ciphertext = oldCrypto.encryptKey('sk-example', { modelName: 'other-model', keyEntryId: 'key-1' })

    expect(rotation.rotate(ciphertext, aad).state).toBe('unreadable')
  })

  it('reports a value without the envelope prefix', () => {
    expect(rotation.rotate('sk-plaintext', aad)).toEqual({ state: 'not-envelope', ciphertext: 'sk-plaintext' })
  })
})

describe('rotateRouterConfig', () => {
  it('re-encrypts every section with the model name as AAD and keeps other fields', () => {
    const raw = routerConfig({
      llm: oldCrypto.encryptKey('sk-llm', aad),
      tts: oldCrypto.encryptKey('sk-tts', { modelName: 'speech-model', keyEntryId: 'key-2' }),
    })

    const rotated = rotateRouterConfig(rotation, raw)
    const stored = JSON.parse(rotated.value!)

    expect(rotated.counts).toEqual({ current: 0, previous: 2, unreadable: 0, notEnvelope: 0 })
    expect(newCrypto.decryptKey(stored.llm.models['chat-model'].upstreams[0].keys[0].ciphertext, aad).toString('utf8')).toBe('sk-llm')
    expect(newCrypto.decryptKey(stored.tts.models['speech-model'].upstreams[0].keys[0].ciphertext, { modelName: 'speech-model', keyEntryId: 'key-2' }).toString('utf8')).toBe('sk-tts')
    expect(stored.llm.models['chat-model'].upstreams[0].headers).toEqual({ 'X-Title': 'AIRI' })
    expect(stored.tts.models['speech-model'].provider).toBe('azure')
    expect(stored.defaults).toEqual({ timeoutMs: 1000 })
  })

  it('returns no value when every key already uses the current key', () => {
    const raw = routerConfig({
      llm: newCrypto.encryptKey('sk-llm', aad),
      tts: newCrypto.encryptKey('sk-tts', { modelName: 'speech-model', keyEntryId: 'key-2' }),
    })

    const rotated = rotateRouterConfig(rotation, raw)

    expect(rotated.value).toBeNull()
    expect(rotated.counts.current).toBe(2)
  })

  it('lists the location of each unreadable key', () => {
    const raw = routerConfig({
      llm: otherCrypto.encryptKey('sk-llm', aad),
      tts: newCrypto.encryptKey('sk-tts', { modelName: 'speech-model', keyEntryId: 'key-2' }),
    })

    expect(rotateRouterConfig(rotation, raw).problems).toEqual([
      { location: 'llm.models[chat-model].upstreams[0].keys[key-1]', state: 'unreadable' },
    ])
  })
})

describe('rotateUnspeechUpstream', () => {
  it('uses the streaming TTS label as the AAD model name', () => {
    const streamingAad = { modelName: 'streaming-tts', keyEntryId: 'stream-1' }
    const raw = JSON.stringify({
      restBaseURL: 'https://example.com/unspeech',
      streaming: { baseURL: 'wss://example.com/unspeech', keys: [{ id: 'stream-1', ciphertext: oldCrypto.encryptKey('sk-stream', streamingAad) }] },
    })

    const rotated = rotateUnspeechUpstream(rotation, raw)
    const stored = JSON.parse(rotated.value!)

    expect(rotated.counts.previous).toBe(1)
    expect(newCrypto.decryptKey(stored.streaming.keys[0].ciphertext, streamingAad).toString('utf8')).toBe('sk-stream')
    expect(stored.restBaseURL).toBe('https://example.com/unspeech')
  })

  it('returns no value without a streaming upstream', () => {
    const rotated = rotateUnspeechUpstream(rotation, JSON.stringify({ restBaseURL: 'https://example.com/unspeech' }))

    expect(rotated.value).toBeNull()
  })
})
