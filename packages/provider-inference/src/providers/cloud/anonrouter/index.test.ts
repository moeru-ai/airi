import type { ChatProvider } from '@xsai-ext/providers/utils'

import type { ProviderInstance } from '../../../types'

import { listModels } from '@xsai/model'
import { describe, expect, it } from 'vitest'
import { parse } from 'zod/v4/core'

import { isModelProvider } from '../../../types'
import { providerAnonRouter } from './index'

function isChatProvider(provider: ProviderInstance): provider is ChatProvider {
  return 'chat' in provider && typeof provider.chat === 'function'
}

async function createAnonRouter() {
  const schema = await providerAnonRouter.createProviderConfig({ t: (key: string) => key })
  const config = parse(schema, { apiKey: 'ar_test-key' })

  return { config, provider: await providerAnonRouter.createProvider(config) }
}

describe('providerAnonRouter', () => {
  it('targets the compatibility-mode endpoint', async () => {
    const { config } = await createAnonRouter()

    expect(config.baseUrl).toBe('https://api.anonrouter.ai/v1')
  })

  it('preserves a configured endpoint and key', async () => {
    const provider = await providerAnonRouter.createProvider({
      apiKey: 'ar_custom-key',
      baseUrl: 'https://example.com/v1/',
    })

    if (!isChatProvider(provider))
      throw new Error('AnonRouter provider must support chat')

    expect(provider.chat('openai/gpt-4o-mini')).toMatchObject({
      apiKey: 'ar_custom-key',
      baseURL: 'https://example.com/v1/',
      model: 'openai/gpt-4o-mini',
    })
  })

  it('sends a nested model id unchanged', async () => {
    const { provider } = await createAnonRouter()

    if (!isChatProvider(provider))
      throw new Error('AnonRouter provider must support chat')

    expect(provider.chat('openai/gpt-4o-mini')).toMatchObject({
      model: 'openai/gpt-4o-mini',
    })
  })

  it('discovers models over an authenticated request to the base URL', async () => {
    const { config, provider } = await createAnonRouter()
    const requests: Array<{ url: string, authorization: string | null }> = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      requests.push({ url: String(input), authorization: new Headers(init?.headers).get('Authorization') })
      return new Response(JSON.stringify({
        data: [{ id: 'openai/gpt-4o-mini' }, { id: 'deepseek/deepseek-chat' }],
        object: 'list',
      }))
    }

    if (!isModelProvider(provider))
      throw new Error('AnonRouter provider must support model listing')

    const models = await listModels({ ...provider.model(), fetch })

    expect(models.map(model => model.id)).toEqual(['openai/gpt-4o-mini', 'deepseek/deepseek-chat'])
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe(`${config.baseUrl}/models`)
    expect(requests[0].authorization).toBe(`Bearer ${config.apiKey}`)
  })
})
