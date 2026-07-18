import type { WebSocketEventOf } from '@proj-airi/server-sdk'

import { describe, expect, it, vi } from 'vitest'

import { setupAgentSparkNotifyHandler } from './handler'

describe('setupAgentSparkNotifyHandler', () => {
  it('captures tracing artifacts for command-only spark runs', async () => {
    const traces: unknown[] = []
    const handler = setupAgentSparkNotifyHandler({
      stream: async (_model, _provider, _messages, options) => {
        const commandTool = options.tools?.find((tool: any) => tool.function?.name === 'builtIn_sparkCommand')
        await commandTool?.execute({
          commands: [
            {
              destinations: ['chess'],
              interrupt: 'false',
              priority: 'high',
              intent: 'action',
              ack: 'play e5',
              guidance: null,
            },
          ],
        })
        await options.onStreamEvent?.({ type: 'finish' } as any)
      },
      getActiveProvider: () => 'mock-provider',
      getActiveModel: () => 'mock-model',
      getProviderInstance: async () => ({} as any),
      onReactionDelta: vi.fn(),
      onReactionEnd: vi.fn(),
      getSystemPrompt: () => 'system',
      getProcessing: () => false,
      setProcessing: vi.fn(),
      getPending: () => [],
      setPending: vi.fn(),
      onTrace: (event: unknown) => traces.push(event),
    } as any)

    const event: WebSocketEventOf<'spark:notify'> = {
      type: 'spark:notify',
      source: 'plugin:airi-plugin-game-chess',
      data: {
        id: 'spark-1',
        eventId: 'evt-1',
        kind: 'ping',
        urgency: 'immediate',
        headline: 'chess update',
        destinations: ['character'],
      },
    }

    const result = await handler.handle(event)

    expect(result?.commands).toHaveLength(1)
    expect(traces.length).toBeGreaterThan(0)
  })

  it('routes forceSparkCommandResponse to the model call', async () => {
    const stream = vi.fn(async (_model, _provider, _messages, options) => {
      await options.onStreamEvent?.({ type: 'finish' } as any)
    })

    const handler = setupAgentSparkNotifyHandler({
      stream,
      getActiveProvider: () => 'mock-provider',
      getActiveModel: () => 'mock-model',
      getProviderInstance: async () => ({} as any),
      onReactionDelta: vi.fn(),
      onReactionEnd: vi.fn(),
      getSystemPrompt: () => 'system',
      getProcessing: () => false,
      setProcessing: vi.fn(),
      getPending: () => [],
      setPending: vi.fn(),
    })

    const event: WebSocketEventOf<'spark:notify'> = {
      type: 'spark:notify',
      source: 'plugin:airi-plugin-game-chess',
      data: {
        id: 'spark-2',
        eventId: 'evt-2',
        kind: 'ping',
        urgency: 'immediate',
        headline: 'command-only update',
        destinations: ['character'],
      },
    }

    await handler.handle(event, {
      forceSparkCommandResponse: true,
    } as any)

    const streamOptions = stream.mock.calls[0]?.[3] as { toolChoice?: unknown } | undefined
    expect(streamOptions?.toolChoice).toEqual({
      type: 'function',
      function: {
        name: 'builtIn_sparkCommand',
      },
    })
  })

  it('applies runtime-only message overrides while rendering one notify turn', async () => {
    const stream = vi.fn(async (_model, _provider, messages, options) => {
      expect(String(messages[0]?.content)).toContain('Extra instruction: stay concise.')
      expect(String(messages[1]?.content)).toContain('"headline": "override update"')
      expect(String(messages[1]?.content)).toContain('Rendered board: white to move, fen=...')
      await options.onStreamEvent?.({ type: 'finish' } as any)
    })

    const handler = setupAgentSparkNotifyHandler({
      stream,
      getActiveProvider: () => 'mock-provider',
      getActiveModel: () => 'mock-model',
      getProviderInstance: async () => ({} as any),
      onReactionDelta: vi.fn(),
      onReactionEnd: vi.fn(),
      getSystemPrompt: () => 'system',
      getProcessing: () => false,
      setProcessing: vi.fn(),
      getPending: () => [],
      setPending: vi.fn(),
    })

    const event: WebSocketEventOf<'spark:notify'> = {
      type: 'spark:notify',
      source: 'plugin:airi-plugin-game-chess',
      data: {
        id: 'spark-3',
        eventId: 'evt-3',
        kind: 'ping',
        urgency: 'immediate',
        headline: 'override update',
        destinations: ['character'],
      },
    }

    await handler.handle(event, {
      forceTextResponse: true,
      messageOverride: {
        appendSystemInstructions: ['Extra instruction: stay concise.'],
        appendUserSections: ['Rendered board: white to move, fen=...'],
      },
    })

    expect(stream).toBeCalledTimes(1)
  })
})
