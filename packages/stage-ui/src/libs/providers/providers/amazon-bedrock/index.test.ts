import { describe, expect, it } from 'vitest'

import { providerAmazonBedrock } from './index'

describe('providerAmazonBedrock', () => {
  it('should have correct id and tasks', () => {
    expect(providerAmazonBedrock.id).toBe('amazon-bedrock')
    expect(providerAmazonBedrock.tasks).toContain('chat')
  })

  it('should require validation when credentials are provided', () => {
    expect(providerAmazonBedrock.validationRequiredWhen?.({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
    })).toBe(true)
  })

  it('should not require validation when credentials are missing', () => {
    expect(providerAmazonBedrock.validationRequiredWhen?.({
      accessKeyId: '',
      secretAccessKey: '',
    })).toBe(false)
  })

  it('should not require validation when only access key is provided', () => {
    expect(providerAmazonBedrock.validationRequiredWhen?.({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: '',
    })).toBe(false)
  })

  it('should create provider with valid config', () => {
    const provider = providerAmazonBedrock.createProvider({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
    })
    expect(provider).toBeDefined()
  })

  it('should use default us-east-1 region when not specified', () => {
    const provider = providerAmazonBedrock.createProvider({
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    })
    expect(provider).toBeDefined()
  })

  it('should fall back to static models when API is unavailable', async () => {
    const models = await providerAmazonBedrock.extraMethods?.listModels?.({
      accessKeyId: 'invalid',
      secretAccessKey: 'invalid',
      region: 'us-east-1',
    }, providerAmazonBedrock.createProvider({
      accessKeyId: 'invalid',
      secretAccessKey: 'invalid',
    }))
    expect(models).toBeDefined()
    expect(models!.length).toBeGreaterThan(0)
    expect(models!.some(m => m.id.includes('nova'))).toBe(true)
  })
})
