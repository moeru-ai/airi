import { generateText } from '@xsai/generate-text'
import { listModels } from '@xsai/model'
import { message } from '@xsai/utils-chat'
import { describe, expect, it } from 'vitest'
import { safeParse } from 'zod/v4/core'

import { providerOrcaRouter } from '.'
import { isModelProvider } from '../../types'

const identityTranslation = ((key: string) => key) as never

describe('providerOrcaRouter', () => {
  it('registers as a chat provider', () => {
    expect(providerOrcaRouter.id).toBe('orcarouter')
    expect(providerOrcaRouter.tasks).toEqual(['chat'])
  })

  it('defaults the base URL to the OrcaRouter endpoint', () => {
    const schema = providerOrcaRouter.createProviderConfig?.({ t: identityTranslation })
    expect(schema).toBeDefined()

    const result = safeParse(schema!, { apiKey: 'sk-orca-test' })
    expect(result.success).toBe(true)
    expect(result.data?.baseUrl).toBe('https://api.orcarouter.ai/v1/')
  })
})

// Integration coverage against the real endpoint. Skipped unless ORCAROUTER_API_KEY
// is set, so CI and local runs without credentials stay offline.
const apiKey = process.env.ORCAROUTER_API_KEY

describe.runIf(apiKey)('providerOrcaRouter (live)', () => {
  const config = { apiKey: apiKey!, baseUrl: 'https://api.orcarouter.ai/v1/' }

  it('lists models', async () => {
    const provider = providerOrcaRouter.createProvider(config)
    expect(isModelProvider(provider)).toBe(true)
    if (!isModelProvider(provider))
      return

    const models = await listModels({ ...provider.model() })
    expect(models.length).toBeGreaterThan(0)
  }, 60_000)

  it('completes a chat turn', async () => {
    const provider = providerOrcaRouter.createProvider(config)
    expect('chat' in provider).toBe(true)
    if (!('chat' in provider))
      return

    const { text } = await generateText({
      ...provider.chat('anthropic/claude-sonnet-4.6'),
      messages: [message.user('Reply with exactly: airi-orcarouter-ok')],
    })
    expect(text).toContain('airi-orcarouter-ok')
  }, 180_000)
})
