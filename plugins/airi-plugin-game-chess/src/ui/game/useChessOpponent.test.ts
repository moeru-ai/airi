import type { AnalysisResult } from '../../schema'

import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useChessOpponent } from './useChessOpponent'

/** Standard chess starting position. */
const STARTPOS = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
/** Position after 1.e4, where Black is the engine by default. */
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'

const analysis: AnalysisResult = {
  fen: AFTER_E4,
  depth: 10,
  bestMove: 'e7e5',
  lines: [{ rank: 1, depth: 10, pv: ['e7e5'], score: { cp: 0, mate: null } }],
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function createHarness() {
  const playMove = vi.fn(() => true)
  const game = {
    fen: ref(AFTER_E4),
    turn: ref<'w' | 'b'>('b'),
    status: ref('playing'),
    playMove,
  }
  const analyzeOpponentMove = vi.fn(async () => analysis)
  const engine = {
    opponentReady: ref(true),
    analyzeOpponentMove,
  }
  return { game, engine, playMove, analyzeOpponentMove }
}

/**
 * @example
 * await opponent.maybeRespond()
 */
describe('useChessOpponent', () => {
  /**
   * @example
   * expect(opponent.inputLocked.value).toBe(true)
   */
  it('locks input during engine turns, engine thinking, and terminal positions', () => {
    const { game, engine } = createHarness()
    const opponent = useChessOpponent(game as any, engine as any)

    opponent.mode.value = 'stockfish'
    expect(opponent.inputLocked.value).toBe(true)

    game.turn.value = 'w'
    expect(opponent.inputLocked.value).toBe(false)

    opponent.thinking.value = true
    expect(opponent.inputLocked.value).toBe(true)

    opponent.thinking.value = false
    game.status.value = 'checkmate'
    expect(opponent.inputLocked.value).toBe(true)
  })

  /**
   * @example
   * expect(playMove).not.toHaveBeenCalled()
   */
  it('drops an engine move when the board changed while Stockfish was thinking', async () => {
    const { game, engine, playMove, analyzeOpponentMove } = createHarness()
    const pending = deferred<AnalysisResult>()
    analyzeOpponentMove.mockReturnValueOnce(pending.promise)
    const opponent = useChessOpponent(game as any, engine as any)
    opponent.mode.value = 'stockfish'

    const response = opponent.maybeRespond()
    game.fen.value = STARTPOS
    game.turn.value = 'w'
    pending.resolve(analysis)
    await response

    expect(playMove).not.toHaveBeenCalled()
  })

  /**
   * @example
   * expect(playMove).not.toHaveBeenCalled()
   */
  it('waits until the opponent-only engine is ready', async () => {
    const { game, engine, playMove, analyzeOpponentMove } = createHarness()
    engine.opponentReady.value = false
    const opponent = useChessOpponent(game as any, engine as any)
    opponent.mode.value = 'stockfish'

    await opponent.maybeRespond()

    expect(analyzeOpponentMove).not.toHaveBeenCalled()
    expect(playMove).not.toHaveBeenCalled()
  })

  /**
   * @example
   * expect(playMove).toHaveBeenCalledWith('e7', 'e5', undefined)
   */
  it('plays the engine move when the analysed position is still current', async () => {
    const { game, engine, playMove } = createHarness()
    const opponent = useChessOpponent(game as any, engine as any)
    opponent.mode.value = 'stockfish'

    await opponent.maybeRespond()

    expect(playMove).toHaveBeenCalledWith('e7', 'e5', undefined)
  })
})
