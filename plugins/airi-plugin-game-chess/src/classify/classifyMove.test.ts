import type { AnalysisResult, MoveContext } from '../schema'

import { describe, expect, it } from 'vitest'

import { MoveClassification } from '../schema'
import { classifyMove } from './classifyMove'

/** Standard starting position — a safe, legal FEN for non-sacrifice fixtures. */
const STARTPOS = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

/**
 * Builds an {@link AnalysisResult} from `[move, centipawns]` pairs, best first.
 * `bestMove` is taken from the first pair.
 */
function analysisOf(fen: string, entries: Array<[move: string, cp: number]>): AnalysisResult {
  const lines = entries.map(([move, cp], index) => ({
    score: { cp, mate: null },
    pv: [move],
    depth: 18,
    rank: index + 1,
  }))
  return { fen, depth: 18, lines, bestMove: entries[0]?.[0] ?? '' }
}

/** Move context for a non-checkmating move between two positions. */
function contextOf(fenBefore: string, fenAfter: string, moveUci: string): MoveContext {
  return { fenBefore, fenAfter, moveUci, isCheck: false, isCheckmate: false }
}

/**
 * @example
 * classifyMove(ctx, evalBefore, evalAfter).classification // MoveClassification.Best
 */
describe('classifyMove', () => {
  /**
   * @example
   * expect(result.classification).toBe(MoveClassification.Best)
   */
  it('labels the engine top move with no centipawn loss as best', () => {
    const ctx = contextOf(STARTPOS, STARTPOS, 'e2e4')
    const before = analysisOf(STARTPOS, [['e2e4', 30]])
    const after = analysisOf(STARTPOS, [['e7e5', -30]])

    const result = classifyMove(ctx, before, after)
    expect(result.classification).toBe(MoveClassification.Best)
    expect(result.cpLoss).toBe(0)
  })

  /**
   * @example
   * expect(classifyMove(ctx, before, after).classification).toBe(MoveClassification.Good)
   */
  it('sorts non-best moves into the reliable centipawn-loss bands', () => {
    // bestCp is fixed at 50; actualCp = -(opponent score) sets the loss.
    const band = (opponentCp: number): MoveClassification =>
      classifyMove(
        contextOf(STARTPOS, STARTPOS, 'a2a3'),
        analysisOf(STARTPOS, [['e2e4', 50]]),
        analysisOf(STARTPOS, [['e7e5', opponentCp]]),
      ).classification

    expect(band(-35)).toBe(MoveClassification.Excellent) // loss 15
    expect(band(-15)).toBe(MoveClassification.Good) // loss 35
    expect(band(20)).toBe(MoveClassification.Inaccuracy) // loss 70
    expect(band(100)).toBe(MoveClassification.Mistake) // loss 150
    expect(band(250)).toBe(MoveClassification.Blunder) // loss 300
  })

  /**
   * @example
   * expect(result.classification).toBe(MoveClassification.Great)
   */
  it('labels the only good move in a critical position as great', () => {
    const ctx = contextOf(STARTPOS, STARTPOS, 'e2e4')
    // Top line is 200cp better than the second — the move was forced-good.
    const before = analysisOf(STARTPOS, [['e2e4', 120], ['d2d4', -80]])
    const after = analysisOf(STARTPOS, [['e7e5', -120]])

    expect(classifyMove(ctx, before, after).classification).toBe(MoveClassification.Great)
  })

  /**
   * @example
   * expect(result.classification).toBe(MoveClassification.Miss)
   */
  it('labels throwing away a winning position as a miss', () => {
    const ctx = contextOf(STARTPOS, STARTPOS, 'a2a3')
    // The engine had a +400 win; the played move drops the mover to +50.
    const before = analysisOf(STARTPOS, [['e2e4', 400]])
    const after = analysisOf(STARTPOS, [['e7e5', -50]])

    expect(classifyMove(ctx, before, after).classification).toBe(MoveClassification.Miss)
  })

  /**
   * @example
   * expect(result.classification).toBe(MoveClassification.Brilliant)
   */
  it('labels a sound sacrifice of a real piece as brilliant', () => {
    // White plays Qd1-d5, the engine's top move, leaving the queen for the
    // c6 pawn; White stays winning, so it is a genuine sacrifice.
    const fenBefore = '4k3/8/2p5/8/8/8/8/3QK3 w - - 0 1'
    const fenAfter = '4k3/8/2p5/3Q4/8/8/8/4K3 b - - 0 1'
    const ctx = contextOf(fenBefore, fenAfter, 'd1d5')
    const before = analysisOf(fenBefore, [['d1d5', 200]])
    const after = analysisOf(fenAfter, [['c6d5', -200]])

    expect(classifyMove(ctx, before, after).classification).toBe(MoveClassification.Brilliant)
  })

  /**
   * @example
   * expect(classifyMove(mateCtx, before, after).classification).toBe(MoveClassification.Best)
   */
  it('labels a checkmating move as best even with no post-move analysis', () => {
    const ctx: MoveContext = {
      fenBefore: STARTPOS,
      fenAfter: STARTPOS,
      moveUci: 'd1h5',
      isCheck: true,
      isCheckmate: true,
    }
    const before = analysisOf(STARTPOS, [['d1h5', 90]])
    const after: AnalysisResult = { fen: STARTPOS, depth: 0, lines: [], bestMove: '' }

    const result = classifyMove(ctx, before, after)
    expect(result.classification).toBe(MoveClassification.Best)
    expect(result.cpLoss).toBe(0)
  })
})
