import type { Square } from 'chess.js'

import type { EngineReview } from '../engine/useEngineReview'

import { effectScope, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useChessGame } from './useChessGame'
import { useGameSession } from './useGameSession'

function engineReviewReturning(result: Awaited<ReturnType<EngineReview['review']>>): EngineReview {
  return {
    ready: ref(true),
    opponentReady: ref(true),
    analyzing: ref(false),
    error: ref(null),
    opponentError: ref(null),
    lastMove: ref(null),
    evaluation: ref(0),
    review: vi.fn(async () => result),
    analyzePosition: vi.fn(),
    analyzeOpponentMove: vi.fn(),
    explainMove: vi.fn(),
  } as unknown as EngineReview
}

/** Flushes Vue's watcher queue plus the async `engine.review` continuation. */
async function flushSessionWatch(): Promise<void> {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('useGameSession', () => {
  it('runs the after-move callback even when review classification is skipped', async () => {
    const game = useChessGame()
    const engine = engineReviewReturning(null)
    const onAfterMove = vi.fn()
    const scope = effectScope()

    scope.run(() => {
      useGameSession(game, engine, { onAfterMove })
    })
    game.playMove('e2' as Square, 'e4' as Square)
    await flushSessionWatch()

    expect(engine.review).toHaveBeenCalledWith(expect.objectContaining({ moveUci: 'e2e4' }))
    expect(onAfterMove).toHaveBeenCalledTimes(1)
    scope.stop()
  })
})
