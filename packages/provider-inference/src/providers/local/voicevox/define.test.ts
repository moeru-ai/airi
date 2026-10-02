import type { SpeechProvider } from '@xsai-ext/providers/utils'

import type { ProviderTranslator } from '../../../types'

import { generateSpeech } from '@xsai/generate-speech'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { providerAivisSpeech, providerVoicevox } from '.'
import { getProviderValidationIntervalMs } from '../../../validators/run'

const translate = ((key: string) => key) as unknown as ProviderTranslator

interface EngineCall {
  init: RequestInit
  url: URL
}

/** Answers the four endpoints over the ambient `fetch` the provider calls. */
function installEngine(): EngineCall[] {
  const calls: EngineCall[] = []

  vi.stubGlobal('fetch', async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.push({ init: init ?? {}, url })

    switch (url.pathname.split('/').pop()) {
      case 'audio_query':
        return Response.json({ intonationScale: 1, pitchScale: 0, speedScale: 1, volumeScale: 1 })
      case 'speakers':
        return Response.json([{ name: 'ずんだもん', speaker_uuid: 'b', styles: [{ id: 3, name: 'ノーマル' }] }])
      case 'synthesis':
        return new Response(new Uint8Array([82, 73, 70, 70]))
      case 'version':
        return new Response('"0.24.1"')
      default:
        throw new Error(`unexpected endpoint ${url.pathname}`)
    }
  })

  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('vOICEVOX family definitions', () => {
  it('ships the documented default port for each engine', async () => {
    expect(z.parse(await providerVoicevox.createProviderConfig({ t: translate }), {}).baseUrl).toBe('http://localhost:50021/')
    expect(z.parse(await providerAivisSpeech.createProviderConfig({ t: translate }), {}).baseUrl).toBe('http://localhost:10101/')
  })

  it('defaults volume and intonation to the engine neutral value, not to zero', async () => {
    // A zero `volumeScale` is silence. The shared settings component seeds
    // `{ pitch: 0, speed: 1, volume: 0 }` when a schema declares no defaults, so
    // a schema without these values makes a new provider synthesize nothing.
    const defaults = z.parse(await providerVoicevox.createProviderConfig({ t: translate }), {})

    expect(defaults.voiceSettings).toEqual({ intonation: 1, pitch: 0, speed: 1, volume: 1 })
  })

  it('declares the reachability schedule where the interval reader looks for it', async () => {
    // `getProviderValidationIntervalMs` reads only `validators.validateProvider`.
    // A schedule declared on `validateConfig` never runs, and reports no error.
    const intervalMs = await getProviderValidationIntervalMs({
      contextOptions: { t: translate },
      definition: providerVoicevox,
    })

    expect(intervalMs).toBe(15_000)
  })

  it('does not expose the chat ping checkbox, which has no meaning for an engine', async () => {
    const validators = await Promise.all((providerVoicevox.validators?.validateProvider ?? []).map(create => create({ t: translate })))

    expect(validators).toHaveLength(1)
    expect(validators[0].id).toBe('voicevox:check-reachability')
  })
})

describe('vOICEVOX configuration validator', () => {
  it('names the engine default when the base URL is empty', async () => {
    const validator = await providerAivisSpeech.validators?.validateConfig?.[0]({ t: translate })

    const result = await validator?.validator({ baseUrl: '  ' }, { t: translate })

    expect(result?.valid).toBe(false)
    expect(result?.reason).toContain('http://localhost:10101/')
  })

  it('rejects a base URL without a scheme', async () => {
    const validator = await providerVoicevox.validators?.validateConfig?.[0]({ t: translate })

    const result = await validator?.validator({ baseUrl: 'localhost:50021' }, { t: translate })

    expect(result?.valid).toBe(false)
    expect(result?.reason).toContain('Base URL is not absolute')
  })

  it('rejects a scheme `fetch` cannot use, even though it parses', async () => {
    const validator = await providerVoicevox.validators?.validateConfig?.[0]({ t: translate })

    const result = await validator?.validator({ baseUrl: 'ftp://engine.local/' }, { t: translate })

    expect(result?.valid).toBe(false)
  })

  it('accepts a configured base URL', async () => {
    const validator = await providerVoicevox.validators?.validateConfig?.[0]({ t: translate })

    const result = await validator?.validator({ baseUrl: 'http://localhost:50021/' }, { t: translate })

    expect(result?.valid).toBe(true)
  })
})

describe('vOICEVOX reachability validator', () => {
  it('passes when the engine answers its version', async () => {
    installEngine()
    const validator = await providerVoicevox.validators?.validateProvider?.[0]({ t: translate })

    const result = await validator?.validator(
      { baseUrl: 'http://localhost:50021/' },
      await providerVoicevox.createProvider({ baseUrl: 'http://localhost:50021/' }),
      {},
      { t: translate },
    )

    expect(result?.valid).toBe(true)
  })

  it('tells the user to check the port when the engine is down', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('Failed to fetch')
    })
    const validator = await providerVoicevox.validators?.validateProvider?.[0]({ t: translate })

    const result = await validator?.validator(
      { baseUrl: 'http://localhost:50021/' },
      await providerVoicevox.createProvider({ baseUrl: 'http://localhost:50021/' }),
      {},
      { t: translate },
    )

    expect(result?.valid).toBe(false)
    expect(result?.reason).toContain('Base URL matches its port')
  })
})

describe('vOICEVOX voice catalogue', () => {
  it('flattens every style of every character into one entry', async () => {
    installEngine()

    const voices = await providerVoicevox.extraMethods?.listVoices?.(
      { baseUrl: 'http://localhost:50021/' },
      await providerVoicevox.createProvider({ baseUrl: 'http://localhost:50021/' }),
    )

    expect(voices).toHaveLength(1)
    expect(voices?.[0].id).toBe('3')
    expect(voices?.[0].name).toBe('ずんだもん / ノーマル')
    expect(voices?.[0].provider).toBe('voicevox')
  })
})

describe('vOICEVOX speech provider', () => {
  it('reads input and voice out of the body that generateSpeech builds', async () => {
    // `requestBody` in `@xsai/shared` runs the options through `objCamelToSnake`,
    // so a key of more than one word arrives renamed. The adapter depends only
    // on the two single-word keys that survive that transform.
    const calls = installEngine()
    const provider = await providerVoicevox.createProvider({
      baseUrl: 'http://localhost:50021/',
      voiceSettings: { intonation: 1, pitch: 0, speed: 1.25, volume: 1 },
    }) as SpeechProvider

    const audio = await generateSpeech({
      ...provider.speech('default'),
      input: 'こんにちは',
      voice: '3',
    })

    expect(Object.fromEntries(calls[0].url.searchParams)).toEqual({ speaker: '3', text: 'こんにちは' })
    expect(JSON.parse(String(calls[1].init.body))).toMatchObject({ speedScale: 1.25 })
    expect(Array.from(new Uint8Array(audio))).toEqual([82, 73, 70, 70])
  })

  it('refuses to synthesize without a selected voice', async () => {
    installEngine()
    const provider = await providerVoicevox.createProvider({ baseUrl: 'http://localhost:50021/' }) as SpeechProvider

    await expect(generateSpeech({ ...provider.speech('default'), input: 'あ', voice: '' }))
      .rejects
      .toThrow(/No voice selected/)
  })
})
