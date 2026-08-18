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

  it('should require validation when apiKey is provided', () => {
    expect(providerAmazonBedrock.validationRequiredWhen?.({
      apiKey: 'some-api-key',
      region: 'us-east-1',
    })).toBe(true)
  })

  it('should not require validation when apiKey is empty', () => {
    expect(providerAmazonBedrock.validationRequiredWhen?.({
      apiKey: '',
      region: 'us-east-1',
    })).toBe(false)
  })

  it('should not require validation when only region is provided', () => {
    expect(providerAmazonBedrock.validationRequiredWhen?.({
      apiKey: '',
    } as any)).toBe(false)
  })

  it('should create provider with valid config', () => {
    const provider = providerAmazonBedrock.createProvider({
      apiKey: 'some-api-key',
      region: 'us-east-1',
    })
    expect(provider).toBeDefined()
  })

  it('should use default us-east-1 region when not specified', () => {
    const provider = providerAmazonBedrock.createProvider({
      apiKey: 'some-api-key',
    } as any)
    expect(provider).toBeDefined()
  })

  it('should fall back to static models when API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    }))
    const models = await providerAmazonBedrock.extraMethods?.listModels?.({
      apiKey: 'invalid-key',
      region: 'us-east-1',
    }, providerAmazonBedrock.createProvider({
      apiKey: 'invalid-key',
      region: 'us-east-1',
    }))
    expect(models).toBeDefined()
    expect(models!.length).toBeGreaterThan(0)
    expect(models!.some(m => m.id.includes('nova'))).toBe(true)
  })
})
