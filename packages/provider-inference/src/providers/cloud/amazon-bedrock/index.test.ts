import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerAmazonBedrock } from './index'

describe('providerAmazonBedrock', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should have correct id and tasks', () => {
    expect(providerAmazonBedrock.id).toBe('amazon-bedrock')
    expect(providerAmazonBedrock.tasks).toContain('chat')
  })

  it('should require validation when apiKey is provided', async () => {
    expect(await providerAmazonBedrock.validationRequiredWhen?.({
      apiKey: 'some-api-key',
      region: 'us-east-1',
    })).toBe(true)
  })

  it('should not require validation when apiKey is empty', async () => {
    expect(await providerAmazonBedrock.validationRequiredWhen?.({
      apiKey: '',
      region: 'us-east-1',
    })).toBe(false)
  })

  it('should not require validation when only region is provided', async () => {
    expect(await providerAmazonBedrock.validationRequiredWhen?.({
      apiKey: '',
    } as any)).toBe(false)
  })

  it('should create provider with valid config', async () => {
    const provider = await providerAmazonBedrock.createProvider({
      apiKey: 'some-api-key',
      region: 'us-east-1',
    })
    expect(provider).toBeDefined()
  })

  it('should use default us-east-1 region when not specified', async () => {
    const provider = await providerAmazonBedrock.createProvider({
      apiKey: 'some-api-key',
    } as any)
    expect(provider).toBeDefined()
  })

  it('should fall back to static models when API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    }))
    const provider = await providerAmazonBedrock.createProvider({
      apiKey: 'invalid-key',
      region: 'us-east-1',
    })
    const models = await providerAmazonBedrock.extraMethods?.listModels?.({
      apiKey: 'invalid-key',
      region: 'us-east-1',
    }, provider)
    expect(models).toBeDefined()
    expect(models!.length).toBeGreaterThan(0)
    expect(models!.some(m => m.id.includes('nova'))).toBe(true)
  })
})
