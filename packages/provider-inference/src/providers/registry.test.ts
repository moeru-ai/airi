import type { PortableProviderId } from '../index'

import { describe, expect, expectTypeOf, it } from 'vitest'

import { getDefinedProvider, listProviders, portableProviderDefinitions } from '../index'

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

  it('does not include providers that require application runtime adapters', () => {
    const providerIds = new Set(listProviders().map(provider => provider.id))

    expect(providerIds).not.toContain('official-provider')
    expect(providerIds).not.toContain('apple-speech-transcription')
    expect(providerIds).not.toContain('kokoro-local')
    expect(providerIds).not.toContain('browser-local-audio-speech')
    expect(providerIds).not.toContain('aliyun-nls-transcription')
  })
})
