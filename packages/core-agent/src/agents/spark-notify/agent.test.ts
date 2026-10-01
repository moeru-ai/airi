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
  // ROOT CAUSE:
  // Notify runs had no cancellation boundary. A late runner could still emit reactions and commands.
  // The host signal now gates preparation, streaming, and completion.
  it('rejects a cancelled notify before calling its model', async () => {
    const controller = new AbortController()
    controller.abort(new Error('Lost notify ownership'))
    const run = vi.fn()
    const agent = createSparkNotifyAgent({ runner: { run } })
    await expect(agent.handle({
      event: createEvent(),
      selectedChat: {
        providerId: 'mock-provider',
        model: 'mock-model',
        provider: { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.test/' } }) },
      },
      systemPrompt: 'You are a character.',
      abortSignal: controller.signal,
    })).rejects.toThrow('Lost notify ownership')
    expect(run).not.toHaveBeenCalled()
  })

  it('blocks late reaction deltas and completion from an aborted runner', async () => {
    const controller = new AbortController()
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const onDelta = vi.fn()
    const onEnd = vi.fn()
    const run = vi.fn(async (request: SparkNotifyRunRequest) => {
      expect(request.abortSignal).toBe(controller.signal)
      entered.resolve()
      await release.promise
      await request.onStreamEvent({ type: 'text-delta', text: 'Stale reaction.' })
    })
    const agent = createSparkNotifyAgent({
      runner: { run },
      plugins: [createSparkNotifyReactionPlugin({ onDelta, onEnd })],
    })
    const result = agent.handle({
      event: createEvent(),
      selectedChat: {
        providerId: 'mock-provider',
        model: 'mock-model',
        provider: { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.test/' } }) },
      },
      systemPrompt: 'You are a character.',
      abortSignal: controller.signal,
    })
    const completion = result.then(() => undefined, (error: unknown) => error)
    await entered.promise
    controller.abort(new Error('Lost notify ownership'))
    release.resolve()
    expect(await completion).toMatchObject({ message: 'Lost notify ownership' })
    expect(onDelta).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('blocks completion when a runner ignores cancellation and returns without deltas', async () => {
    const controller = new AbortController()
    const onEnd = vi.fn()
    const agent = createSparkNotifyAgent({
      runner: { run: async () => { controller.abort(new Error('Lost notify ownership')) } },
      plugins: [createSparkNotifyReactionPlugin({ onDelta: vi.fn(), onEnd })],
    })
    await expect(agent.handle({
      event: createEvent(),
      selectedChat: {
        providerId: 'mock-provider',
        model: 'mock-model',
        provider: { generation: model => ({ protocol: 'chat-completions', config: { model, baseURL: 'https://example.test/' } }) },
      },
      systemPrompt: 'You are a character.',
      abortSignal: controller.signal,
    })).rejects.toThrow('Lost notify ownership')
    expect(onEnd).not.toHaveBeenCalled()
  })

  it('runs the selected chat and sends reaction text through a plugin', async () => {
    const onDelta = vi.fn()
    const onEnd = vi.fn()
    const observedEvents: string[] = []
    const run = vi.fn(async (request: SparkNotifyRunRequest) => {
      expect(request.conversation.turns).toHaveLength(2)
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
