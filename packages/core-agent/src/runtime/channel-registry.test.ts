import type { AgentChannelAdapter } from './channel-registry'

import { describe, expect, it, vi } from 'vitest'

import { createAgentChannelRegistry } from './channel-registry'

function createAdapter(channelId: string): AgentChannelAdapter {
  return {
    channelId,
    sendMessage: vi.fn(async () => {}),
  }
}

/**
 * @example
 * const registry = createAgentChannelRegistry()
 * registry.registerChannel(createAdapter('stage-ui'))
 */
describe('createAgentChannelRegistry', () => {
  /**
   * @example
   * Registering `stage-ui` and `satori` makes both adapters queryable by channel id.
   */
  it('registers stage-ui and satori adapters by channel id', () => {
    const registry = createAgentChannelRegistry()
    const stageUiAdapter = createAdapter('stage-ui')
    const satoriAdapter = createAdapter('satori')

    registry.registerChannel(stageUiAdapter)
    registry.registerChannel(satoriAdapter)

    expect(registry.getChannel('stage-ui')).toBe(stageUiAdapter)
    expect(registry.getChannel('satori')).toBe(satoriAdapter)
  })

  /**
   * @example
   * getChannel('satori') returns undefined before a Satori adapter is registered.
   */
  it('returns undefined when a channel adapter has not been registered', () => {
    const registry = createAgentChannelRegistry()

    expect(registry.getChannel('satori')).toBeUndefined()
  })

  /**
   * @example
   * requireChannel('satori', { sessionId: 'session-1', messageId: 'message-1' }) names the missing route.
   */
  it('throws a contextual error when a required channel adapter has not been registered', () => {
    const registry = createAgentChannelRegistry()

    expect(() => registry.requireChannel('satori', {
      sessionId: 'session-1',
      messageId: 'message-1',
    })).toThrow('Cannot resolve channel adapter for channel "satori" session "session-1" message "message-1": channel is not registered')
  })

  /**
   * @example
   * Registering the same channel twice fails and leaves the first adapter in place.
   */
  it('rejects duplicate channel registration without replacing the existing adapter', () => {
    const registry = createAgentChannelRegistry()
    const firstAdapter = createAdapter('stage-ui')
    const duplicateAdapter = createAdapter('stage-ui')

    registry.registerChannel(firstAdapter)

    expect(() => registry.registerChannel(duplicateAdapter)).toThrow('Cannot register channel adapter for channel "stage-ui": channel is already registered')
    expect(registry.getChannel('stage-ui')).toBe(firstAdapter)
  })
})
