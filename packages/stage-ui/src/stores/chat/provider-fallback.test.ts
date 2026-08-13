import type { ChatProvider } from '@xsai-ext/providers/utils'

import { describe, expect, it, vi } from 'vitest'

import { resolveChatProviderRoute } from './provider-fallback'

function provider(id: string): ChatProvider {
  return {
    chat: () => ({ baseURL: `https://${id}.example.com/` }),
  } as unknown as ChatProvider
}

function createDependencies(models: Record<string, string[]>) {
  const fetchModels = vi.fn(async (providerId: string) => (models[providerId] ?? []).map(id => ({
    id,
    name: id,
    provider: providerId,
  })))
  const getProviderInstance = vi.fn(async (providerId: string) => provider(providerId))

  return {
    dependencies: {
      fetchModels,
      getCachedModels: vi.fn(() => []),
      getProviderInstance,
      supportsModelListing: vi.fn((providerId: string) => providerId !== 'official-provider'),
    },
    fetchModels,
    getProviderInstance,
  }
}

describe('chat provider fallback', () => {
  // ROOT CAUSE:
  //
  // Login sync did not repair an existing official provider with an empty model.
  // Chat rejected that persisted state before it could use the official auto route.
  //
  // The resolver now treats official-provider and auto as one runtime invariant.
  it('uses official auto for an authenticated empty selection', async () => {
    const { dependencies, fetchModels, getProviderInstance } = createDependencies({})

    const route = await resolveChatProviderRoute({
      activeModel: '',
      activeProvider: 'official-provider',
      authenticated: true,
      configuredProviderIds: ['official-provider'],
    }, dependencies)

    expect(route.primary.providerId).toBe('official-provider')
    expect(route.primary.model).toBe('auto')
    expect(fetchModels).not.toHaveBeenCalled()
    expect(getProviderInstance).toHaveBeenCalledWith('official-provider')
  })

  it('skips a missing active model and uses official auto after login', async () => {
    const { dependencies, fetchModels } = createDependencies({
      openai: ['gpt-available'],
    })

    const route = await resolveChatProviderRoute({
      activeModel: 'gpt-removed',
      activeProvider: 'openai',
      authenticated: true,
      configuredProviderIds: ['openai'],
    }, dependencies)

    expect(route.primary.providerId).toBe('official-provider')
    expect(route.primary.model).toBe('auto')
    expect(fetchModels).toHaveBeenCalledWith('openai')
  })

  it('skips official while logged out and keeps configured provider order', async () => {
    const { dependencies, fetchModels, getProviderInstance } = createDependencies({
      first: [],
      second: ['second-model'],
      third: ['third-model'],
    })

    const route = await resolveChatProviderRoute({
      activeModel: '',
      activeProvider: '',
      authenticated: false,
      configuredProviderIds: ['official-provider', 'first', 'second', 'third'],
    }, dependencies)

    expect(route.primary.providerId).toBe('second')
    expect(route.primary.model).toBe('second-model')
    expect(fetchModels.mock.calls.map(([providerId]) => providerId)).toEqual(['first', 'second'])
    expect(getProviderInstance).toHaveBeenCalledTimes(1)

    const thirdSource = route.fallbackCandidates[0]
    expect(typeof thirdSource).toBe('function')
    const third = typeof thirdSource === 'function' ? await thirdSource() : thirdSource
    expect(third?.providerId).toBe('third')
    expect(third?.model).toBe('third-model')
  })
})
