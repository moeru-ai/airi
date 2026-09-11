import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'zod/v4/core'

import { createProviderRegistry } from '../registry'
import { providerBytePlus } from './byteplus'
import { providerBytePlusCodingPlan } from './byteplus-coding-plan'
import { providerVolcengineCodingPlan } from './volcengine-coding-plan'

const { createOpenAIMock } = vi.hoisted(() => ({
  createOpenAIMock: vi.fn((apiKey: string, baseURL: string) => ({
    apiKey,
    baseURL,
    chat: vi.fn((model: string) => ({ apiKey, baseURL, model })),
  })),
}))

vi.mock('@xsai-ext/providers/create', () => ({
  createOpenAI: createOpenAIMock,
}))

describe('ark chat provider definitions', () => {
  beforeEach(() => {
    vi.resetModules()
    createOpenAIMock.mockClear()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists prefixed models and strips the prefix before chat requests', async () => {
    const provider = createProviderRegistry([providerVolcengineCodingPlan]).get('volcengine-coding-plan')
    expect(provider).toBeDefined()

    const schema = await provider!.createProviderConfig({ t: input => input })
    const parsedConfig = parse(schema, {
      apiKey: 'test-key',
    })

    expect(parsedConfig.baseUrl).toBe('https://ark.cn-beijing.volces.com/api/coding/v3')

    const providerInstance = await provider!.createProvider(parsedConfig)
    if (!('chat' in providerInstance))
      throw new Error('Volcengine coding plan provider must support chat')
    const chatConfig = providerInstance.chat('volcengine-coding-plan/doubao-seed-2.1-turbo')
    expect(chatConfig.model).toBe('doubao-seed-2.1-turbo')

    const descriptions: Record<string, string> = {
      'settings.pages.providers.provider.volcengine-coding-plan.models.ark-code-latest.description': 'Localized current model description.',
      'settings.pages.providers.provider.volcengine-coding-plan.models.legacy.description': 'Localized legacy model description.',
    }
    const listedModels = await provider!.extraMethods!.listModels!(parsedConfig, providerInstance, {
      t: input => descriptions[input] ?? input,
    })
    expect(listedModels.map(model => model.id)).toEqual([
      'volcengine-coding-plan/ark-code-latest',
      'volcengine-coding-plan/doubao-seed-2.1-turbo',
      'volcengine-coding-plan/doubao-seed-2.0-lite',
      'volcengine-coding-plan/minimax-m3',
      'volcengine-coding-plan/kimi-k2.7-code',
      'volcengine-coding-plan/glm-5.3',
      'volcengine-coding-plan/deepseek-v4-flash',
      'volcengine-coding-plan/deepseek-v4-pro',
      'volcengine-coding-plan/doubao-seed-2.0-code',
      'volcengine-coding-plan/doubao-seed-2.0-pro',
    ])

    expect(listedModels[0]).toEqual({
      description: 'Localized current model description.',
      id: 'volcengine-coding-plan/ark-code-latest',
      name: 'ark-code-latest',
      provider: 'volcengine-coding-plan',
    })
    expect(listedModels.slice(-2)).toEqual([
      {
        contextLength: 256000,
        deprecated: true,
        description: 'Localized legacy model description.',
        id: 'volcengine-coding-plan/doubao-seed-2.0-code',
        name: 'doubao-seed-2.0-code',
        provider: 'volcengine-coding-plan',
      },
      {
        contextLength: 256000,
        deprecated: true,
        description: 'Localized legacy model description.',
        id: 'volcengine-coding-plan/doubao-seed-2.0-pro',
        name: 'doubao-seed-2.0-pro',
        provider: 'volcengine-coding-plan',
      },
    ])
  })

  it('registers byteplus providers with the spec base urls', async () => {
    const registry = createProviderRegistry([providerBytePlus, providerBytePlusCodingPlan])
    const byteplus = registry.get('byteplus')
    const byteplusCodingPlan = registry.get('byteplus-coding-plan')

    expect(byteplus).toBeDefined()
    expect(byteplusCodingPlan).toBeDefined()

    const byteplusConfig = parse(await byteplus!.createProviderConfig({ t: input => input }), { apiKey: 'test-key' })
    const byteplusCodingPlanConfig = parse(await byteplusCodingPlan!.createProviderConfig({ t: input => input }), { apiKey: 'test-key' })

    expect(byteplusConfig.baseUrl).toBe('https://ark.ap-southeast.bytepluses.com/api/v3')
    expect(byteplusCodingPlanConfig.baseUrl).toBe('https://ark.ap-southeast.bytepluses.com/api/coding/v3')

    const byteplusProvider = await byteplus!.createProvider(byteplusConfig)
    const byteplusCodingPlanProvider = await byteplusCodingPlan!.createProvider(byteplusCodingPlanConfig)
    const byteplusModels = await byteplus!.extraMethods!.listModels!(byteplusConfig, byteplusProvider)
    const byteplusCodingPlanModels = await byteplusCodingPlan!.extraMethods!.listModels!(byteplusCodingPlanConfig, byteplusCodingPlanProvider)

    expect(byteplusModels.map(model => model.id)).toEqual([
      'byteplus/seed-2-0-pro-260328',
      'byteplus/seed-2-0-lite-260228',
      'byteplus/seed-2-0-mini-260215',
      'byteplus/kimi-k2-5-260127',
      'byteplus/glm-4-7-251222',
    ])
    expect(byteplusCodingPlanModels.map(model => model.id)).toEqual([
      'byteplus-coding-plan/dola-seed-2.0-pro',
      'byteplus-coding-plan/dola-seed-2.0-lite',
      'byteplus-coding-plan/bytedance-seed-code',
      'byteplus-coding-plan/glm-4.7',
      'byteplus-coding-plan/kimi-k2.5',
      'byteplus-coding-plan/gpt-oss-120b',
    ])
  })
})

describe('ark live model refresh', () => {
  // https://github.com/moeru-ai/airi/issues/2138
  // ROOT CAUSE:
  //
  // If the endpoint ships a new coding-plan model, the UI still hides it.
  // Users wait for the next client release before the model appears.
  // This happens because ark-shared listModels returned only the static
  // array and never called the live /models endpoint.
  //
  // <before-patch>
  // listModels: async (_config, _provider, contextOptions) => models.map(...)
  // The static array was the full result. No fetch ran.
  // </before-patch>
  //
  // We fixed this by merging live /models results after the static catalog.
  // Static entries keep their metadata and win on duplicate ids. Unknown
  // live ids are appended. No API key means no fetch. Any endpoint failure,
  // timeout, or stall falls back to the static catalog, so one slow provider
  // never blocks the providers after it.
  // <after-patch>
  // listModels({ apiKey, baseURL: baseUrl, abortSignal: controller.signal })
  // with a 5000ms AbortController timeout, then merge into staticModels.
  // </after-patch>
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function listVolcengineModels(apiKey: string) {
    const provider = createProviderRegistry([providerVolcengineCodingPlan]).get('volcengine-coding-plan')
    if (!provider)
      throw new Error('Volcengine coding plan provider must be registered')
    const schema = await provider.createProviderConfig({ t: input => input })
    const parsedConfig = parse(schema, { apiKey })
    const providerInstance = await provider.createProvider(parsedConfig)
    return provider!.extraMethods!.listModels!(parsedConfig, providerInstance, { t: input => input })
  }

  it('issue #2138 merges live endpoint models after the static catalog', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [
      { id: 'doubao-seed-2.1-turbo' },
      { id: 'doubao-seed-3-0-code' },
    ] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const listedModels = await listVolcengineModels('test-key')
    const ids = listedModels.map(model => model.id)
    expect(ids.slice(0, 10)).toEqual([
      'volcengine-coding-plan/ark-code-latest',
      'volcengine-coding-plan/doubao-seed-2.1-turbo',
      'volcengine-coding-plan/doubao-seed-2.0-lite',
      'volcengine-coding-plan/minimax-m3',
      'volcengine-coding-plan/kimi-k2.7-code',
      'volcengine-coding-plan/glm-5.3',
      'volcengine-coding-plan/deepseek-v4-flash',
      'volcengine-coding-plan/deepseek-v4-pro',
      'volcengine-coding-plan/doubao-seed-2.0-code',
      'volcengine-coding-plan/doubao-seed-2.0-pro',
    ])
    expect(ids).toContain('volcengine-coding-plan/doubao-seed-3-0-code')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('https://ark.cn-beijing.volces.com/api/coding/v3/models')
  })

  it('issue #2138 falls back to the static catalog when the endpoint is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network unavailable'))
    const listedModels = await listVolcengineModels('test-key')
    expect(listedModels.map(model => model.id)).toHaveLength(10)
    expect(listedModels[0]?.id).toBe('volcengine-coding-plan/ark-code-latest')
  })

  it('issue #2138 falls back to the static catalog when the live endpoint stalls', async () => {
    vi.useFakeTimers()
    try {
      fetchMock.mockImplementation((_input: unknown, init?: { signal?: AbortSignal }) => new Promise<never>((_resolve, reject) => {
        const signal = init?.signal
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'))
          return
        }
        signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      }))
      const pending = listVolcengineModels('test-key')
      await vi.advanceTimersByTimeAsync(100)
      expect(fetchMock).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(6000)
      const listedModels = await pending
      expect(listedModels.map(model => model.id)).toHaveLength(10)
      expect(listedModels[0]?.id).toBe('volcengine-coding-plan/ark-code-latest')
      const signal = (fetchMock.mock.calls[0]?.[1] as RequestInit | undefined)?.signal
      expect(signal?.aborted).toBe(true)

      fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'doubao-seed-3-0-code' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      const recovered = await listVolcengineModels('test-key')
      expect(recovered.map(model => model.id)).toContain('volcengine-coding-plan/doubao-seed-3-0-code')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('issue #2138 performs no fetch without an API key', async () => {
    const listedModels = await listVolcengineModels('')
    expect(listedModels.map(model => model.id)).toHaveLength(10)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('issue #2138 keeps non-opted-in ark providers static without fetching', async () => {
    fetchMock.mockRejectedValue(new Error('must not fetch'))
    const provider = createProviderRegistry([providerBytePlusCodingPlan]).get('byteplus-coding-plan')
    if (!provider)
      throw new Error('BytePlus coding plan provider must be registered')
    const schema = await provider.createProviderConfig({ t: input => input })
    const parsedConfig = parse(schema, { apiKey: 'test-key' })
    const providerInstance = await provider.createProvider(parsedConfig)
    const listedModels = await provider!.extraMethods!.listModels!(parsedConfig, providerInstance, { t: input => input })
    expect(listedModels.map(model => model.id)).toEqual([
      'byteplus-coding-plan/dola-seed-2.0-pro',
      'byteplus-coding-plan/dola-seed-2.0-lite',
      'byteplus-coding-plan/bytedance-seed-code',
      'byteplus-coding-plan/glm-4.7',
      'byteplus-coding-plan/kimi-k2.5',
      'byteplus-coding-plan/gpt-oss-120b',
    ])
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
