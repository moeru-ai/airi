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
      payload: {
        fallbackResponseText: 'Fallback text.',
        requestId: 'req-1',
        sparkNotify: {
          destinations: ['character'],
          forceTextResponse: true,
          headline: 'AIRI move',
          kind: 'ping',
          note: 'Explain the chess move.',
          payload: {
            moveSan: 'Nf3',
          },
          source: 'plugin:airi-plugin-game-chess',
          urgency: 'immediate',
        },
      },
      route: {
        name: 'request',
        namespace: 'airi.plugin.game.chess.commentary',
      },
    }, {
      dispatchSparkNotifyReaction,
      emit,
    })

    expect(result).toBe(true)
    expect(dispatchSparkNotifyReaction).toHaveBeenCalledWith({
      destinations: ['character'],
      fallbackResponseText: 'Fallback text.',
      forceTextResponse: true,
      headline: 'AIRI move',
      kind: 'ping',
      note: 'Explain the chess move.',
      payload: {
        moveSan: 'Nf3',
      },
      source: 'plugin:airi-plugin-game-chess',
      urgency: 'immediate',
    })
    expect(emit).toHaveBeenCalledWith(widgetsIframeBroadcastEvent, {
      payload: {
        requestId: 'req-1',
        text: 'Nice tactic.',
      },
      route: {
        name: 'response',
        namespace: 'airi.plugin.game.chess.commentary',
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
      payload: {
        requestId: 'req-1',
      },
      route: {
        name: 'response',
        namespace: 'airi.plugin.game.chess.gamelet',
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
      payload: {
        fallbackResponseText: '',
        requestId: 'req-quick',
        sparkNotify: {
          forceTextResponse: true,
          headline: 'Quick move',
        },
      },
      route: {
        name: 'request',
        namespace: 'airi.plugin.game.chess.commentary',
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
      name: 'chess.play',
      reaction: 'Played.',
      type: 'called' as const,
    }))
    const emit = vi.fn()

    const result = await publishWidgetSparkNotifyReaction({
      payload: {
        calls: [
          {
            examples: [
              '<|CALL ["chess.play", {"move":"Nf3"}]|>',
            ],
            name: 'chess.play',
            prompt: 'Play the prepared chess reply.',
          },
        ],
        fallbackResponseText: 'fallback',
        requestId: 'req-call',
        sparkNotify: {
          destinations: ['character'],
          headline: 'A move is ready',
          kind: 'ping',
          urgency: 'immediate',
        },
        timeoutMs: 15000,
      },
      route: {
        name: 'request',
        namespace: 'airi.plugin.game.chess.commentary',
      },
    }, {
      dispatchSparkNotifyPerformance,
      dispatchSparkNotifyReaction,
      emit,
    })

    expect(result).toBe(true)
    expect(dispatchSparkNotifyReaction).not.toHaveBeenCalled()
    expect(dispatchSparkNotifyPerformance).toHaveBeenCalledWith(expect.objectContaining({
      calls: [
        {
          handler: expect.any(Function),
          manifest: {
            examples: [
              '<|CALL ["chess.play", {"move":"Nf3"}]|>',
            ],
            name: 'chess.play',
            prompt: 'Play the prepared chess reply.',
          },
        },
      ],
      fallbackResponseText: 'fallback',
      headline: 'A move is ready',
      timeoutMs: 15000,
    }))
    expect(emit).toHaveBeenCalledWith(widgetsIframeBroadcastEvent, expect.objectContaining({
      payload: expect.objectContaining({
        performance: {
          name: 'chess.play',
          type: 'called',
        },
        requestId: 'req-call',
        text: 'Played.',
      }),
    }))
  })
})
