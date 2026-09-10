import type { PortableProviderId } from '../index'

import { describe, expect, expectTypeOf, it } from 'vitest'

import { createProviderRegistry, getDefinedProvider, listProviders, portableProviderDefinitions } from '../index'

describe('portable provider registry', () => {
  it('exports the portable provider id union', () => {
    expectTypeOf<'openai'>().toExtend<PortableProviderId>()
    expectTypeOf<string>().not.toExtend<PortableProviderId>()

    expect(getDefinedProvider('openai')).toBeDefined()
  })

  it('registers each portable definition by id', () => {
    for (const definition of portableProviderDefinitions)
      expect(getDefinedProvider(definition.id)).toBe(definition)
  })

  it('lists definitions in deterministic display order', () => {
    expect(listProviders()).toEqual(listProviders())
  })

  it('places definitions without an order after all ordered definitions', () => {
    const [template] = portableProviderDefinitions
    const registry = createProviderRegistry([
      { ...template, id: 'unordered-z', name: 'Zeta', order: undefined },
      { ...template, id: 'high-order', name: 'High order', order: 100_000 },
      { ...template, id: 'unordered-a', name: 'Alpha', order: undefined },
    ])

    expect(registry.list().map(provider => provider.id)).toEqual([
      'high-order',
      'unordered-a',
      'unordered-z',
    ])
  })

  it('does not include providers that require application runtime adapters', () => {
    const providerIds = new Set(listProviders().map(provider => provider.id))

    expect(providerIds).not.toContain('official-provider')
    expect(providerIds).not.toContain('apple-speech-transcription')
    expect(providerIds).not.toContain('kokoro-local')
    expect(providerIds).not.toContain('browser-local-audio-speech')
    expect(providerIds).not.toContain('aliyun-nls-transcription')
  })
})
