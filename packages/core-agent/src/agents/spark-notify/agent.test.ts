import type { WebSocketEventOf } from '@proj-airi/server-sdk'
import type { ChatProvider } from '@xsai-ext/providers/utils'

import type { SparkNotifyRunRequest } from './types'

import { describe, expect, it, vi } from 'vitest'

import { createSparkNotifyAgent } from './agent'
import { createSparkNotifyObserverPlugin, createSparkNotifyReactionPlugin } from './plugins'

function createEvent(): WebSocketEventOf<'spark:notify'> {
  return {
    data: {
      destinations: ['character'],
      eventId: 'evt-1',
      headline: 'Chess update',
      id: 'spark-1',
      kind: 'ping',
      urgency: 'immediate',
    },
    source: 'plugin:airi-plugin-game-chess',
    type: 'spark:notify',
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
      await request.onStreamEvent({ text: 'Checkmate.', type: 'text-delta' })
    })
    const agent = createSparkNotifyAgent({
      createId: () => 'generated-id',
      plugins: [
        createSparkNotifyReactionPlugin({ onDelta, onEnd }),
        createSparkNotifyObserverPlugin((event) => {
          observedEvents.push(event.type)
        }),
      ],
      runner: { run },
    })

    const result = await agent.handle({
      event: createEvent(),
      selectedChat: {
        model: 'mock-model',
        provider: {} as ChatProvider,
        providerId: 'mock-provider',
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
      await request.onStreamEvent({ text: 'I will speak.', type: 'text-delta' })
    })
    const agent = createSparkNotifyAgent({ runner: { run } })

    await agent.handle({
      control: { forceTextResponse: true },
      event: createEvent(),
      selectedChat: {
        model: 'mock-model',
        provider: {} as ChatProvider,
        providerId: 'mock-provider',
      },
      systemPrompt: 'You are a character.',
    })

    expect(run).toHaveBeenCalledTimes(1)
  })
})
