import { describe, expect, it } from 'vitest'

import { createSpeechAudioCacheKey, SpeechAudioCache } from './audio-cache'

describe('createSpeechAudioCacheKey', () => {
  it('creates stable key with identical inputs', () => {
    const key1 = createSpeechAudioCacheKey({
      providerId: 'elevenlabs',
      model: 'eleven_multilingual_v2',
      voiceId: 'voice-1',
      text: 'Hello world',
      pitch: 0,
      speed: 1,
      ssml: false,
    })
    const key2 = createSpeechAudioCacheKey({
      providerId: 'elevenlabs',
      model: 'eleven_multilingual_v2',
      voiceId: 'voice-1',
      text: 'Hello world',
      pitch: 0,
      speed: 1,
      ssml: false,
    })

    expect(key1).toBe(key2)
  })

  it('differentiates keys on voice or pitch changes', () => {
    const keyVoice1 = createSpeechAudioCacheKey({
      providerId: 'elevenlabs',
      model: 'eleven_multilingual_v2',
      voiceId: 'voice-1',
      text: 'Hello',
    })
    const keyVoice2 = createSpeechAudioCacheKey({
      providerId: 'elevenlabs',
      model: 'eleven_multilingual_v2',
      voiceId: 'voice-2',
      text: 'Hello',
    })
    const keyPitch = createSpeechAudioCacheKey({
      providerId: 'elevenlabs',
      model: 'eleven_multilingual_v2',
      voiceId: 'voice-1',
      text: 'Hello',
      pitch: 10,
    })

    expect(keyVoice1).not.toBe(keyVoice2)
    expect(keyVoice1).not.toBe(keyPitch)
  })
})

describe('speechAudioCache', () => {
  it('stores and retrieves cached Blobs', () => {
    const cache = new SpeechAudioCache()
    const blob = new Blob(['sample-audio-data'])

    cache.set('key-1', blob)

    expect(cache.has('key-1')).toBe(true)
    expect(cache.get('key-1')).toBe(blob)
    expect(cache.size).toBe(1)
    expect(cache.byteSize).toBe(blob.size)
  })

  it('evicts least recently used items when exceeding maxEntries', () => {
    const cache = new SpeechAudioCache({ maxEntries: 2 })
    const blob1 = new Blob(['audio-1'])
    const blob2 = new Blob(['audio-2'])
    const blob3 = new Blob(['audio-3'])

    cache.set('k1', blob1)
    cache.set('k2', blob2)
    // Access k1 to make k2 the least recently used
    expect(cache.get('k1')).toBe(blob1)

    // Inserting k3 must evict k2
    cache.set('k3', blob3)

    expect(cache.has('k1')).toBe(true)
    expect(cache.has('k2')).toBe(false)
    expect(cache.has('k3')).toBe(true)
    expect(cache.size).toBe(2)
  })

  it('evicts items when exceeding maxBytes limit', () => {
    // 20 bytes limit
    const cache = new SpeechAudioCache({ maxBytes: 20 })
    const blob1 = new Blob(['1234567890']) // 10 bytes
    const blob2 = new Blob(['1234567890']) // 10 bytes
    const blob3 = new Blob(['12345']) // 5 bytes

    cache.set('k1', blob1)
    cache.set('k2', blob2)
    expect(cache.byteSize).toBe(20)

    // Adding blob3 will exceed 20 bytes so k1 is evicted
    cache.set('k3', blob3)

    expect(cache.has('k1')).toBe(false)
    expect(cache.has('k2')).toBe(true)
    expect(cache.has('k3')).toBe(true)
    expect(cache.byteSize).toBe(15)
  })

  it('handles item replacement and removal cleanly', () => {
    const cache = new SpeechAudioCache()
    const blob1 = new Blob(['short'])
    const blob2 = new Blob(['much-longer-audio-chunk'])

    cache.set('k1', blob1)
    expect(cache.byteSize).toBe(blob1.size)

    cache.set('k1', blob2)
    expect(cache.byteSize).toBe(blob2.size)

    expect(cache.delete('k1')).toBe(true)
    expect(cache.size).toBe(0)
    expect(cache.byteSize).toBe(0)
  })

  it('clears all entries on clear()', () => {
    const cache = new SpeechAudioCache()
    cache.set('k1', new Blob(['1']))
    cache.set('k2', new Blob(['2']))

    cache.clear()

    expect(cache.size).toBe(0)
    expect(cache.byteSize).toBe(0)
    expect(cache.has('k1')).toBe(false)
  })

  it('skips caching blobs larger than maxBytes budget', () => {
    const cache = new SpeechAudioCache({ maxBytes: 100 })
    const hugeBlob = new Blob([new Uint8Array(150)])
    cache.set('huge', hugeBlob)

    expect(cache.has('huge')).toBe(false)
    expect(cache.size).toBe(0)
    expect(cache.byteSize).toBe(0)
  })
})
