import { widgetsIframeBroadcastEvent } from '@proj-airi/plugin-sdk-tamagotchi/widgets'
import { describe, expect, it, vi } from 'vitest'

import { publishWidgetSparkNotifyReaction } from './use-bridge-spark'

/**
 * @example
 * await publishWidgetSparkNotifyReaction(event, options)
 * expect(options.dispatchSparkNotifyReaction).toHaveBeenCalledWith(expect.objectContaining({ headline: 'AIRI move' }))
 */
describe('publishWidgetSparkNotifyReaction', () => {
  /**
   * @example
   * expect(result).toBe(true)
   * expect(emit).toHaveBeenCalledWith(widgetsIframeBroadcastEvent, expect.objectContaining({ payload: expect.objectContaining({ text: 'Nice tactic.' }) }))
   */
  it('dispatches spark notify requests and broadcasts commentary responses to the iframe', async () => {
    const dispatchSparkNotifyReaction = vi.fn(async () => 'Nice tactic.')
    const emit = vi.fn()

    const result = await publishWidgetSparkNotifyReaction({
      route: {
        namespace: 'airi.plugin.game.chess.commentary',
        name: 'request',
      },
      payload: {
        requestId: 'req-1',
        fallbackResponseText: 'Fallback text.',
        sparkNotify: {
          kind: 'ping',
          urgency: 'immediate',
          forceTextResponse: true,
          headline: 'AIRI move',
          note: 'Explain the chess move.',
          destinations: ['character'],
          source: 'plugin:airi-plugin-game-chess',
          payload: {
            moveSan: 'Nf3',
          },
        },
      },
    }, {
      dispatchSparkNotifyReaction,
      emit,
    })

    expect(result).toBe(true)
    expect(dispatchSparkNotifyReaction).toHaveBeenCalledWith({
      kind: 'ping',
      urgency: 'immediate',
      forceTextResponse: true,
      fallbackResponseText: 'Fallback text.',
      headline: 'AIRI move',
      note: 'Explain the chess move.',
      destinations: ['character'],
      source: 'plugin:airi-plugin-game-chess',
      payload: {
        moveSan: 'Nf3',
      },
    })
    expect(emit).toHaveBeenCalledWith(widgetsIframeBroadcastEvent, {
      route: {
        namespace: 'airi.plugin.game.chess.commentary',
        name: 'response',
      },
      payload: {
        requestId: 'req-1',
        text: 'Nice tactic.',
      },
    })
  })

  /**
   * @example
   * expect(result).toBe(false)
   * expect(dispatchSparkNotifyReaction).not.toHaveBeenCalled()
   */
  it('ignores non spark notify iframe events', async () => {
    const dispatchSparkNotifyReaction = vi.fn(async () => 'unused')
    const emit = vi.fn()

    const result = await publishWidgetSparkNotifyReaction({
      route: {
        namespace: 'airi.plugin.game.chess.gamelet',
        name: 'response',
      },
      payload: {
        requestId: 'req-1',
      },
    }, {
      dispatchSparkNotifyReaction,
      emit,
    })

    expect(result).toBe(false)
    expect(dispatchSparkNotifyReaction).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  })

  /**
   * @example
   * expect(dispatchSparkNotifyReaction).toHaveBeenCalledWith(expect.objectContaining({ fallbackResponseText: '' }))
   */
  it('allows empty fallback response text for optional commentary phases', async () => {
    const dispatchSparkNotifyReaction = vi.fn(async () => '')
    const emit = vi.fn()

    const result = await publishWidgetSparkNotifyReaction({
      route: {
        namespace: 'airi.plugin.game.chess.commentary',
        name: 'request',
      },
      payload: {
        requestId: 'req-quick',
        fallbackResponseText: '',
        sparkNotify: {
          headline: 'Quick move',
          forceTextResponse: true,
        },
      },
    }, {
      dispatchSparkNotifyReaction,
      emit,
    })

    expect(result).toBe(true)
    expect(dispatchSparkNotifyReaction).toHaveBeenCalledWith(expect.objectContaining({
      fallbackResponseText: '',
      headline: 'Quick move',
    }))
  })

  /**
   * @example
   * await publishWidgetSparkNotifyReaction(eventWithCalls, options)
   * expect(options.dispatchSparkNotifyPerformance).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 15000 }))
   */
  it('uses awaitable performance notify when the widget declares calls', async () => {
    const dispatchSparkNotifyReaction = vi.fn(async () => 'unused')
    const dispatchSparkNotifyPerformance = vi.fn(async () => ({
      type: 'called' as const,
      name: 'chess.play',
      reaction: 'Played.',
    }))
    const emit = vi.fn()

    const result = await publishWidgetSparkNotifyReaction({
      route: {
        namespace: 'airi.plugin.game.chess.commentary',
        name: 'request',
      },
      payload: {
        requestId: 'req-call',
        fallbackResponseText: 'fallback',
        calls: [
          {
            name: 'chess.play',
            prompt: 'Play the prepared chess reply.',
            examples: [
              '<|CALL ["chess.play", {"move":"Nf3"}]|>',
            ],
          },
        ],
        timeoutMs: 15000,
        sparkNotify: {
          kind: 'ping',
          urgency: 'immediate',
          headline: 'A move is ready',
          destinations: ['character'],
        },
      },
    }, {
      dispatchSparkNotifyReaction,
      dispatchSparkNotifyPerformance,
      emit,
    })

    expect(result).toBe(true)
    expect(dispatchSparkNotifyReaction).not.toHaveBeenCalled()
    expect(dispatchSparkNotifyPerformance).toHaveBeenCalledWith(expect.objectContaining({
      headline: 'A move is ready',
      fallbackResponseText: 'fallback',
      timeoutMs: 15000,
      calls: [
        {
          manifest: {
            name: 'chess.play',
            prompt: 'Play the prepared chess reply.',
            examples: [
              '<|CALL ["chess.play", {"move":"Nf3"}]|>',
            ],
          },
          handler: expect.any(Function),
        },
      ],
    }))
    expect(emit).toHaveBeenCalledWith(widgetsIframeBroadcastEvent, expect.objectContaining({
      payload: expect.objectContaining({
        requestId: 'req-call',
        text: 'Played.',
        performance: {
          type: 'called',
          name: 'chess.play',
        },
      }),
    }))
  })
})
