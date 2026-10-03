import { describe, expect, it, vi } from 'vitest'

import {
  applyVoicevoxParameters,
  fetchEngineVersion,
  fetchSpeakers,
  synthesizeSpeech,
} from './engine'

const SPEAKERS = [
  { name: 'ずんだもん', speaker_uuid: 'a', styles: [{ id: 3, name: 'ノーマル' }, { id: 1, name: 'あまあま' }] },
  { name: '四国めたん', speaker_uuid: 'b', styles: [{ id: 2, name: 'ノーマル' }] },
]

const AUDIO_QUERY = { accent_phrases: [], intonationScale: 1, pitchScale: 0, speedScale: 1, volumeScale: 1 }

interface EngineCall {
  init: RequestInit
  url: URL
}

/**
 * Answers the four endpoints and records what reached them.
 *
 * @example
 * const engine = fakeEngine()
 * await fetchSpeakers('http://localhost:50021/', { fetch: engine.fetch })
 * engine.calls[0].url.pathname // => '/speakers'
 */
function fakeEngine(overrides: { synthesis?: () => Response } = {}) {
  const calls: EngineCall[] = []

  const fetchImpl = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.push({ init: init ?? {}, url })

    switch (url.pathname.split('/').pop()) {
      case 'audio_query':
        return Response.json(AUDIO_QUERY)
      case 'speakers':
        return Response.json(SPEAKERS)
      case 'synthesis':
        return overrides.synthesis?.() ?? new Response(new Uint8Array([82, 73, 70, 70]))
      case 'version':
        return new Response('"0.24.1"')
      default:
        throw new Error(`unexpected endpoint ${url.pathname}`)
    }
  })

  return { calls, fetch: fetchImpl as unknown as typeof globalThis.fetch }
}

describe('engine request', () => {
  it('keeps a base URL path segment when the user omits the trailing slash', async () => {
    const engine = fakeEngine()

    await fetchSpeakers('http://example.internal/engine', { fetch: engine.fetch })

    expect(engine.calls[0].url.href).toBe('http://example.internal/engine/speakers')
  })

  it('resolves against the origin when the base URL has no path', async () => {
    const engine = fakeEngine()

    await fetchSpeakers('  http://localhost:50021  ', { fetch: engine.fetch })

    expect(engine.calls[0].url.href).toBe('http://localhost:50021/speakers')
  })

  it('gets the endpoints that read and posts the two that synthesize', async () => {
    const engine = fakeEngine()

    await fetchEngineVersion('http://localhost:50021/', { fetch: engine.fetch })
    await fetchSpeakers('http://localhost:50021/', { fetch: engine.fetch })
    await synthesizeSpeech('http://localhost:50021/', { styleId: '3', text: 'あ' }, { fetch: engine.fetch })

    expect(engine.calls.map(call => call.init.method)).toEqual(['GET', 'GET', 'POST', 'POST'])
  })

  it('sends no body for audio_query, whose text travels in the query string', async () => {
    const engine = fakeEngine()

    await synthesizeSpeech('http://localhost:50021/', { styleId: '3', text: 'こんにちは' }, { fetch: engine.fetch })

    const [audioQuery] = engine.calls
    expect(audioQuery.init.body).toBeUndefined()
    expect(Object.fromEntries(audioQuery.url.searchParams)).toEqual({ speaker: '3', text: 'こんにちは' })
  })

  it('sends the audio query back as a JSON body on synthesis', async () => {
    const engine = fakeEngine()

    await synthesizeSpeech('http://localhost:50021/', { styleId: '3', text: 'あ' }, { fetch: engine.fetch })

    const synthesis = engine.calls[1]
    expect(synthesis.init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(String(synthesis.init.body))).toMatchObject(AUDIO_QUERY)
    expect(Object.fromEntries(synthesis.url.searchParams)).toEqual({ speaker: '3' })
  })

  it('refuses redirects, because no engine in the family redirects', async () => {
    const engine = fakeEngine()

    await fetchSpeakers('http://localhost:50021/', { fetch: engine.fetch })

    expect(engine.calls[0].init.redirect).toBe('error')
  })

  it('reports a base URL it cannot resolve as an address problem, not as a parser error', async () => {
    const engine = fakeEngine()

    await expect(fetchSpeakers('', { fetch: engine.fetch }))
      .rejects
      .toThrow(/not an absolute http/)
  })

  it('names the endpoint and the status when the engine rejects the request', async () => {
    const failing = vi.fn(async () => new Response('speaker not found', { status: 422, statusText: 'Unprocessable Entity' }))

    await expect(fetchSpeakers('http://localhost:50021/', { fetch: failing as unknown as typeof globalThis.fetch }))
      .rejects
      .toThrow(/422 Unprocessable Entity for \/speakers: speaker not found/)
  })
})

describe('synthesizeSpeech', () => {
  it('calls audio_query and then synthesis, carrying the style id on both', async () => {
    const engine = fakeEngine()

    await synthesizeSpeech('http://localhost:50021/', { styleId: '3', text: 'あ' }, { fetch: engine.fetch })

    expect(engine.calls.map(call => call.url.pathname)).toEqual(['/audio_query', '/synthesis'])
    expect(engine.calls.every(call => call.url.searchParams.get('speaker') === '3')).toBe(true)
  })

  it('writes the four controls onto the audio query and leaves the rest alone', async () => {
    const engine = fakeEngine()

    await synthesizeSpeech(
      'http://localhost:50021/',
      { parameters: { intonation: 1.5, pitch: 0.05, speed: 1.25, volume: 0.8 }, styleId: '3', text: 'あ' },
      { fetch: engine.fetch },
    )

    expect(JSON.parse(String(engine.calls[1].init.body))).toEqual({
      accent_phrases: [],
      intonationScale: 1.5,
      pitchScale: 0.05,
      speedScale: 1.25,
      volumeScale: 0.8,
    })
  })

  it('returns the synthesis bytes unchanged', async () => {
    const engine = fakeEngine()

    const wav = await synthesizeSpeech('http://localhost:50021/', { styleId: '3', text: 'あ' }, { fetch: engine.fetch })

    expect(Array.from(new Uint8Array(wav))).toEqual([82, 73, 70, 70])
  })

  it('forwards the abort signal so a cancelled turn stops mid synthesis', async () => {
    const engine = fakeEngine()
    const controller = new AbortController()

    await synthesizeSpeech(
      'http://localhost:50021/',
      { styleId: '3', text: 'あ' },
      { fetch: engine.fetch, signal: controller.signal },
    )

    expect(engine.calls.every(call => call.init.signal === controller.signal)).toBe(true)
  })
})

describe('applyVoicevoxParameters', () => {
  it('keeps the engine value for a control the user never touched', () => {
    const audioQuery = { intonationScale: 1, pitchScale: 0, speedScale: 1, volumeScale: 1 }

    applyVoicevoxParameters(audioQuery, { speed: 1.5 })

    expect(audioQuery).toEqual({ intonationScale: 1, pitchScale: 0, speedScale: 1.5, volumeScale: 1 })
  })

  it('writes a zero rather than treating it as absent', () => {
    const audioQuery = { intonationScale: 1, pitchScale: 0.1, speedScale: 1, volumeScale: 1 }

    applyVoicevoxParameters(audioQuery, { pitch: 0 })

    expect(audioQuery.pitchScale).toBe(0)
  })
})

describe('fetchSpeakers', () => {
  it('returns the characters with their styles in engine order', async () => {
    const engine = fakeEngine()

    const speakers = await fetchSpeakers('http://localhost:50021/', { fetch: engine.fetch })

    expect(speakers.map(speaker => speaker.name)).toEqual(['ずんだもん', '四国めたん'])
    expect(speakers[0].styles.map(style => style.id)).toEqual([3, 1])
  })

  it('reports a body that is not JSON as a wrong Base URL rather than as a parse error', async () => {
    const html = vi.fn(async () => new Response('<!doctype html><html></html>'))

    await expect(fetchSpeakers('http://localhost:8080/', { fetch: html as unknown as typeof globalThis.fetch }))
      .rejects
      .toThrow(/points at a VOICEVOX-compatible engine/)
  })
})

describe('fetchEngineVersion', () => {
  it('strips the quotes of the bare JSON string the engine returns', async () => {
    const engine = fakeEngine()

    expect(await fetchEngineVersion('http://localhost:50021/', { fetch: engine.fetch })).toBe('0.24.1')
  })
})
