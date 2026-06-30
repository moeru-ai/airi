import type { ChatProvider } from '@xsai-ext/providers/utils'

import type { AgentChannelMessage } from '../types/channel'

import { describe, expect, it, vi } from 'vitest'

import { createAgentRuntimeConfig } from './agent-runtime-config'

const provider = {
  chat: () => ({ baseURL: 'https://example.com/' }),
} as unknown as ChatProvider

const explicitProvider = {
  chat: () => ({ baseURL: 'https://explicit.example.com/' }),
} as unknown as ChatProvider

function createMessage(overrides: Partial<AgentChannelMessage> = {}): AgentChannelMessage {
  return {
    id: overrides.id ?? 'message-1',
    channelId: overrides.channelId ?? 'stage-ui',
    sessionId: overrides.sessionId ?? 'session-1',
    role: 'user',
    content: overrides.content ?? 'hello',
    createdAt: overrides.createdAt ?? 1,
    ...overrides,
  }
}

/**
 * @example
 * const config = createAgentRuntimeConfig()
 * await config.resolveExecutionOptions(message)
 */
describe('createAgentRuntimeConfig', () => {
  /**
   * @example
   * Default execution profile resolves the provider id, model, and provider instance.
   */
  it('resolves execution options from the shared default profile', async () => {
    const resolver = vi.fn(async (providerId: string) => ({
      chatProvider: provider,
      providerConfig: {
        headers: {
          'x-provider-id': providerId,
        },
      },
    }))
    const config = createAgentRuntimeConfig({
      defaultExecutionProfile: {
        providerId: 'mock-provider',
        model: 'gpt-test',
      },
      providerResolver: resolver,
    })

    const result = await config.resolveExecutionOptions(createMessage())

    expect(resolver).toHaveBeenCalledWith('mock-provider')
    expect(result.providerId).toBe('mock-provider')
    expect(result.model).toBe('gpt-test')
    expect(result.chatProvider).toBe(provider)
    expect(result.providerConfig).toEqual({
      headers: {
        'x-provider-id': 'mock-provider',
      },
    })
  })

  /**
   * @example
   * Overrides can replace the default provider, model, and provider config.
   */
  it('lets explicit overrides win over the shared default profile and resolver config', async () => {
    const resolver = vi.fn(async () => ({
      chatProvider: provider,
      providerConfig: {
        headers: {
          'x-provider-id': 'default-provider',
        },
      },
    }))
    const config = createAgentRuntimeConfig({
      defaultExecutionProfile: {
        providerId: 'default-provider',
        model: 'default-model',
      },
      providerResolver: resolver,
    })

    const result = await config.resolveExecutionOptions(createMessage(), {
      providerId: 'override-provider',
      model: 'override-model',
      providerConfig: {
        headers: {
          'x-provider-id': 'override-provider',
        },
      },
    })

    expect(resolver).toHaveBeenCalledWith('override-provider')
    expect(result.providerId).toBe('override-provider')
    expect(result.model).toBe('override-model')
    expect(result.chatProvider).toBe(provider)
    expect(result.providerConfig).toEqual({
      headers: {
        'x-provider-id': 'override-provider',
      },
    })
  })

  /**
   * @example
   * Optional override fields with undefined values behave like omitted fields.
   */
  it('ignores undefined override fields when applying default and resolver fallbacks', async () => {
    const resolver = vi.fn(async (providerId: string) => ({
      chatProvider: provider,
      providerConfig: {
        headers: {
          'x-provider-id': providerId,
        },
      },
    }))
    const config = createAgentRuntimeConfig({
      defaultExecutionProfile: {
        providerId: 'default-provider',
        model: 'default-model',
      },
      providerResolver: resolver,
    })

    const result = await config.resolveExecutionOptions(createMessage(), {
      providerId: undefined,
      model: undefined,
      chatProvider: undefined,
      providerConfig: undefined,
    })

    expect(resolver).toHaveBeenCalledWith('default-provider')
    expect(result.providerId).toBe('default-provider')
    expect(result.model).toBe('default-model')
    expect(result.chatProvider).toBe(provider)
    expect(result.providerConfig).toEqual({
      headers: {
        'x-provider-id': 'default-provider',
      },
    })
  })

  /**
   * @example
   * Existing callers with a concrete provider do not need a resolver.
   */
  it('preserves explicit chatProvider behavior without requiring a resolver', async () => {
    const config = createAgentRuntimeConfig()

    const result = await config.resolveExecutionOptions(createMessage(), {
      model: 'explicit-model',
      chatProvider: explicitProvider,
    })

    expect(result.providerId).toBeUndefined()
    expect(result.model).toBe('explicit-model')
    expect(result.chatProvider).toBe(explicitProvider)
  })

  /**
   * @example
   * Satori and stage-ui messages resolve through the same default profile in PR1.
   */
  it('shares one default execution profile across all channels', async () => {
    const resolver = vi.fn(async () => ({ chatProvider: provider }))
    const config = createAgentRuntimeConfig({
      defaultExecutionProfile: {
        providerId: 'shared-provider',
        model: 'shared-model',
      },
      providerResolver: resolver,
    })

    const stageResult = await config.resolveExecutionOptions(createMessage({
      id: 'stage-message',
      channelId: 'stage-ui',
      sessionId: 'stage-session',
    }))
    const satoriResult = await config.resolveExecutionOptions(createMessage({
      id: 'satori-message',
      channelId: 'satori',
      sessionId: 'satori-session',
    }))

    expect(resolver).toHaveBeenCalledTimes(2)
    expect(resolver).toHaveBeenNthCalledWith(1, 'shared-provider')
    expect(resolver).toHaveBeenNthCalledWith(2, 'shared-provider')
    expect(stageResult.providerId).toBe('shared-provider')
    expect(stageResult.model).toBe('shared-model')
    expect(satoriResult.providerId).toBe('shared-provider')
    expect(satoriResult.model).toBe('shared-model')
  })

  /**
   * @example
   * Missing profile errors include channel, session, and message context.
   */
  it('fails clearly when no profile or model override is available', async () => {
    const resolver = vi.fn(async () => ({ chatProvider: provider }))
    const config = createAgentRuntimeConfig({
      providerResolver: resolver,
    })

    await expect(config.resolveExecutionOptions(createMessage({
      id: 'satori-message',
      channelId: 'satori',
      sessionId: 'satori-session',
    }))).rejects.toThrow('Cannot resolve execution model for channel "satori" session "satori-session" message "satori-message"')
    expect(resolver).not.toHaveBeenCalled()
  })

  /**
   * @example
   * Missing resolver errors identify the message that could not resolve a provider.
   */
  it('fails clearly when no provider resolver is configured', async () => {
    const config = createAgentRuntimeConfig({
      defaultExecutionProfile: {
        providerId: 'mock-provider',
        model: 'gpt-test',
      },
    })

    await expect(config.resolveExecutionOptions(createMessage({
      id: 'stage-message',
      channelId: 'stage-ui',
      sessionId: 'stage-session',
    }))).rejects.toThrow('Cannot resolve chat provider for channel "stage-ui" session "stage-session" message "stage-message"')
  })
})
