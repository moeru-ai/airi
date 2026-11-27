import type { WebSocketEventOf } from '@proj-airi/server-sdk'

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
      expect(request.conversation.turns).toHaveLength(2)
      expect(request.tools).toHaveLength(2)
      const system = request.conversation.turns[0]
      if (system.type !== 'system')
        throw new Error('Expected the Spark system prompt')
      expect(system.content).toEqual(expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining('builtIn_sparkCommand') }),
      ]))
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
        provider: { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.test/' } }) },
      },
      systemPrompt: 'You are a character.',
    })

    expect(result.commands).toEqual([])
    expect(onDelta).toHaveBeenCalledWith('spark-1', 'Checkmate.')
    expect(onEnd).toHaveBeenCalledWith('spark-1', 'Checkmate.')
    expect(observedEvents).toContain('model-output-text')
    expect(observedEvents).toContain('result')
  })

  // https://github.com/moeru-ai/airi/pull/2459#discussion_r4002621225
  // ROOT CAUSE:
  // The forced-text policy removed tools but kept the command instruction.
  // Build the instruction from the same command policy that selects tools.
  it('omits unavailable Spark command instructions when the host forces text for Issue #2161', async () => {
    const run = vi.fn(async (request: SparkNotifyRunRequest) => {
      expect(request.tools).toEqual([])
      expect(request.policy.supportsTools).toBe(false)
      const system = request.conversation.turns[0]
      expect(system.type).toBe('system')
      if (system.type !== 'system')
        throw new Error('Expected the Spark system prompt')
      expect(system.content).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining('builtIn_sparkCommand') }),
      ]))
      await request.onStreamEvent({ type: 'text-delta', text: 'I will speak.' })
    })
    const agent = createSparkNotifyAgent({ runner: { run } })

    await agent.handle({
      event: createEvent(),
      selectedChat: {
        providerId: 'mock-provider',
        model: 'mock-model',
        provider: { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.test/' } }) },
      },
      systemPrompt: 'You are a character.',
      control: { forceTextResponse: true },
    })

    expect(run).toHaveBeenCalledTimes(1)
  })

  // https://github.com/moeru-ai/airi/pull/2464#discussion_r3933609456
  it('keeps appended sections when the host replaces the user payload', async () => {
    const run = vi.fn(async (request: SparkNotifyRunRequest) => {
      expect(request.conversation.turns[1].type === 'user' ? request.conversation.turns[1].content : undefined).toEqual([{ type: 'text', text: 'Rendered board snapshot\n\nCaller context\n\nRuntime prompt' }])
    })
    const agent = createSparkNotifyAgent({ runner: { run } })

    await agent.handle({
      event: createEvent(),
      selectedChat: {
        providerId: 'mock-provider',
        model: 'mock-model',
        provider: { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.test/' } }) },
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
