import { beforeEach, describe, expect, it, vi } from 'vitest'

const createOpenAIMock = vi.fn((apiKey: string, baseURL: string) => ({
  apiKey,
  baseURL,
  chat: vi.fn((model: string) => ({
    apiKey,
    baseURL,
    model,
  })),
}))

vi.mock('@xsai-ext/providers/create', () => ({
  createOpenAI: createOpenAIMock,
}))

describe('ark chat provider definitions', () => {
  beforeEach(() => {
    vi.resetModules()
    createOpenAIMock.mockClear()
  })

  it('lists prefixed models and strips the prefix before chat requests', async () => {
    const { getDefinedProvider } = await import('./registry')
    await import('./volcengine-coding-plan')

    const provider = getDefinedProvider('volcengine-coding-plan')
    expect(provider).toBeDefined()

    const schema = provider!.createProviderConfig({ t: input => input }) as any
    const parsedConfig = schema.parse({
      apiKey: 'test-key',
    })

    expect(parsedConfig.baseUrl).toBe('https://ark.cn-beijing.volces.com/api/coding/v3')

    const providerInstance = provider!.createProvider(parsedConfig) as any
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
    const { getDefinedProvider } = await import('./registry')
    await import('./byteplus')
    await import('./byteplus-coding-plan')

    const byteplus = getDefinedProvider('byteplus')
    const byteplusCodingPlan = getDefinedProvider('byteplus-coding-plan')

    expect(byteplus).toBeDefined()
    expect(byteplusCodingPlan).toBeDefined()

    const byteplusConfig = (byteplus!.createProviderConfig({ t: input => input }) as any).parse({ apiKey: 'test-key' })
    const byteplusCodingPlanConfig = (byteplusCodingPlan!.createProviderConfig({ t: input => input }) as any).parse({ apiKey: 'test-key' })

    expect(byteplusConfig.baseUrl).toBe('https://ark.ap-southeast.bytepluses.com/api/v3')
    expect(byteplusCodingPlanConfig.baseUrl).toBe('https://ark.ap-southeast.bytepluses.com/api/coding/v3')

    const byteplusModels = await byteplus!.extraMethods!.listModels!(byteplusConfig, byteplus!.createProvider(byteplusConfig))
    const byteplusCodingPlanModels = await byteplusCodingPlan!.extraMethods!.listModels!(byteplusCodingPlanConfig, byteplusCodingPlan!.createProvider(byteplusCodingPlanConfig))

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
