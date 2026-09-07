import type { WebSocketEventOf } from '@proj-airi/server-sdk'
import type { ChatProvider } from '@xsai-ext/providers/utils'

import type { SparkNotifyRunRequest } from './types'

import { describe, expect, it, vi } from 'vitest'

import { createSparkNotifyAgent } from './agent'
import { createSparkNotifyObserverPlugin, createSparkNotifyReactionPlugin } from './plugins'

function createEvent(): WebSocketEventOf<'spark:notify'> {
  return {
    type: 'spark:notify',
    source: 'plugin:airi-plugin-game-chess',
    data: {
      id: 'spark-1',
      eventId: 'evt-1',
      kind: 'ping',
      urgency: 'immediate',
      headline: 'Chess update',
      destinations: ['character'],
    },
  }
}

describe('createSparkNotifyAgent', () => {
  it('runs the selected chat and sends reaction text through a plugin', async () => {
    const onDelta = vi.fn()
    const onEnd = vi.fn()
    const observedEvents: string[] = []
    const run = vi.fn(async (request: SparkNotifyRunRequest) => {
      expect(request.messages).toHaveLength(2)
      expect(request.tools).toHaveLength(2)
      await request.onStreamEvent({ type: 'text-delta', text: 'Checkmate.' })
    })
    const agent = createSparkNotifyAgent({
      runner: { run },
      plugins: [
        createSparkNotifyReactionPlugin({ onDelta, onEnd }),
        createSparkNotifyObserverPlugin((event) => {
          observedEvents.push(event.type)
        }),
      ],
      createId: () => 'generated-id',
    })

    const result = await agent.handle({
      event: createEvent(),
      selectedChat: {
        providerId: 'mock-provider',
        model: 'mock-model',
        provider: {} as ChatProvider,
      },
      systemPrompt: 'You are a character.',
    })

    expect(result.commands).toEqual([])
    expect(onDelta).toHaveBeenCalledWith('spark-1', 'Checkmate.')
    expect(onEnd).toHaveBeenCalledWith('spark-1', 'Checkmate.')
    expect(observedEvents).toContain('model-output-text')
    expect(observedEvents).toContain('result')
  })

  it('does not expose tools when the host forces a text response', async () => {
    const run = vi.fn(async (request: SparkNotifyRunRequest) => {
      expect(request.tools).toEqual([])
      await request.onStreamEvent({ type: 'text-delta', text: 'I will speak.' })
    })
    const agent = createSparkNotifyAgent({ runner: { run } })

    await agent.handle({
      event: createEvent(),
      selectedChat: {
        providerId: 'mock-provider',
        model: 'mock-model',
        provider: {} as ChatProvider,
      },
      systemPrompt: 'You are a character.',
      control: { forceTextResponse: true },
    })

    expect(run).toHaveBeenCalledTimes(1)
  })

  // https://github.com/moeru-ai/airi/pull/2464#discussion_r3933609456
  it('keeps appended sections when the host replaces the user payload', async () => {
    const run = vi.fn(async (request: SparkNotifyRunRequest) => {
      expect(request.messages[1]?.content).toBe('Rendered board snapshot\n\nCaller context\n\nRuntime prompt')
    })
    const agent = createSparkNotifyAgent({ runner: { run } })

    await agent.handle({
      event: createEvent(),
      selectedChat: {
        providerId: 'mock-provider',
        model: 'mock-model',
        provider: {} as ChatProvider,
      },
      systemPrompt: 'You are a character.',
      runtimePrompt: 'Runtime prompt',
      control: {
        messageOverride: {
          replaceUserMessage: 'Rendered board snapshot',
          appendUserSections: ['Caller context'],
        },
      },
    })

    expect(run).toHaveBeenCalledTimes(1)
  })
})
