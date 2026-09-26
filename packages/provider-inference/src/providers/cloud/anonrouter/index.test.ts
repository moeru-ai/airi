import type { ChatProvider } from '@xsai-ext/providers/utils'

import type { ProviderInstance } from '../../../types'

import { listModels } from '@xsai/model'
import { describe, expect, it } from 'vitest'
import { parse } from 'zod/v4/core'

import { isModelProvider } from '../../../types'
import { providerAnonRouter } from './index'

interface ResolvedConfig {
  apiKey: string
  baseUrl: string
}

function isChatProvider(provider: ProviderInstance): provider is ChatProvider {
  return 'chat' in provider && typeof provider.chat === 'function'
}

async function createAnonRouter() {
  const schema = await providerAnonRouter.createProviderConfig({ t: (key: string) => key })
  const config = parse(schema, { apiKey: 'ar_test-key' }) as ResolvedConfig

  return { config, provider: await providerAnonRouter.createProvider(config) }
}

describe('providerAnonRouter', () => {
  it('targets the compatibility-mode endpoint', async () => {
    const { config } = await createAnonRouter()

    expect(config.baseUrl).toBe('https://api.anonrouter.ai/v1')
  })

  // AnonRouter names models `creator/model`, so a request carries a slash inside
  // the model id. Anything that split or re-encoded the id would send a name the
  // router cannot resolve.
  it('sends a nested model id unchanged', async () => {
    const { provider } = await createAnonRouter()

    if (!isChatProvider(provider))
      throw new Error('AnonRouter provider must support chat')

    expect(provider.chat('anthropic/claude-opus-5')).toMatchObject({
      model: 'anthropic/claude-opus-5',
    })
  })

  // The base URL carries no trailing slash, and model discovery is authenticated.
  // Both are easy to get wrong: a mis-joined path reaches `/v1models`, and a
  // missing bearer token makes AnonRouter answer as though no key was sent.
  it('discovers models over an authenticated request to the base URL', async () => {
    const { config, provider } = await createAnonRouter()
    const requests: Array<{ url: string, authorization: string | null }> = []
    const fetch: typeof globalThis.fetch = async (input, init) => {
      requests.push({ url: String(input), authorization: new Headers(init?.headers).get('Authorization') })
      return new Response(JSON.stringify({ data: [], object: 'list' }))
    }

    if (!isModelProvider(provider))
      throw new Error('AnonRouter provider must support model listing')

    await listModels({ ...provider.model(), fetch })

    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe(`${config.baseUrl}/models`)
    expect(requests[0].authorization).toBe(`Bearer ${config.apiKey}`)
  })
})
