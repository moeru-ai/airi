import { describe, expect, it } from 'vitest'

import { providerAmazonBedrock } from './index'

describe('providerAmazonBedrock', () => {
  it('should have correct id and tasks', () => {
    expect(providerAmazonBedrock.id).toBe('amazon-bedrock')
    expect(providerAmazonBedrock.tasks).toContain('chat')
  })

  it('should require validation when credentials are provided', () => {
    expect(providerAmazonBedrock.validationRequiredWhen?.({
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    })).toBe(true)
  })

  it('should not require validation when credentials are missing', () => {
    expect(providerAmazonBedrock.validationRequiredWhen?.({
      region: 'us-east-1',
      accessKeyId: '',
      secretAccessKey: '',
    })).toBe(false)
  })

  it('should create provider with valid config', () => {
    const provider = providerAmazonBedrock.createProvider({
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    })
    expect(provider).toBeDefined()
  })

  it('should list available models', async () => {
    const models = await providerAmazonBedrock.extraMethods?.listModels?.({
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
    }, providerAmazonBedrock.createProvider({
      region: 'us-east-1',
      accessKeyId: 'test',
      secretAccessKey: 'test',
    }))
    expect(models).toBeDefined()
    expect(models!.length).toBeGreaterThan(0)
    expect(models!.some(m => m.id.includes('claude'))).toBe(true)
  })
})
