import type { AnalysisResult, ClassifiedMove, EngineScore, MoveContext } from '../schema'

import { Chess } from 'chess.js'

import { MoveClassification } from '../schema'

/**
 * Centipawn-equivalent magnitude assigned to a forced mate. Large enough that
 * any mate outranks any material score, so mates always sort to the top.
 */
const MATE_SCORE = 100_000

/** Rough piece values in pawns, used only for spotting sacrifices. */
const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

/** Centipawn-loss band upper bounds for the six reliable, non-heuristic labels. */
const EXCELLENT_MAX_CP_LOSS = 20
const GOOD_MAX_CP_LOSS = 50
const INACCURACY_MAX_CP_LOSS = 100
const MISTAKE_MAX_CP_LOSS = 200

/** Minimum gap (cp) between the best and second-best line for a `great` move. */
const GREAT_MIN_GAP = 150
/** A position is "clearly winning" for `miss` detection at or above this cp. */
const MISS_WINNING_CP = 300
/** Below this cp the advantage counts as thrown away for `miss` detection. */
const MISS_LOST_CP = 100

/**
 * Collapses an {@link EngineScore} onto one signed centipawn axis so mates and
 * material scores become directly comparable.
 *
 * Before:
 * - `{ cp: null, mate: 3 }`
 *
 * After:
 * - `99997` — mate in 3, just below mate in 2 and far above any cp score.
 */
function toCentipawns(score: EngineScore | undefined): number {
  if (!score)
    return 0
  if (score.mate !== null)
    return score.mate > 0 ? MATE_SCORE - score.mate : -MATE_SCORE - score.mate
  return score.cp ?? 0
}

/**
 * Returns the pawn value captured by playing `uciMove` in `fen`, or 0 when the
 * move is quiet or cannot legally be applied to the position.
 */
function capturedValue(fen: string, uciMove: string): number {
  try {
    const game = new Chess(fen)
    const move = game.move({
      from: uciMove.slice(0, 2),
      to: uciMove.slice(2, 4),
      promotion: uciMove.slice(4, 5) || undefined,
    })
    return move.captured ? (PIECE_VALUE[move.captured] ?? 0) : 0
  }
  catch {
    return 0
  }
}

/**
 * Classifies one played move into a {@link MoveClassification}.
 *
 * Use when:
 * - The game-state layer has applied a move and gathered engine analysis of
 *   the positions immediately before and after it
 *
 * Expects:
 * - `evalBefore` analyses {@link MoveContext.fenBefore}; for `great` detection
 *   it should be a MultiPV analysis (>=2 lines), otherwise `great` never fires
 * - `evalAfter` analyses {@link MoveContext.fenAfter} (the opponent's turn), so
 *   its scores are negated here to return to the mover's perspective
 *
 * Returns:
 * - The label plus the centipawns lost versus the engine's best move. The six
 *   centipawn-loss labels are exact; `brilliant`/`great`/`miss` use deliberately
 *   conservative heuristics that prefer to miss a case rather than mislabel one.
 *   `book` is never returned — opening-book moves are detected upstream.
 */
export function classifyMove(
  ctx: MoveContext,
  evalBefore: AnalysisResult,
  evalAfter: AnalysisResult,
): ClassifiedMove {
  const isBestMove = ctx.moveUci === evalBefore.bestMove

  // Best the mover could get vs. what the played move actually yields.
  // `evalAfter` is from the opponent's perspective, hence the negation; a
  // delivered checkmate is a maximal win regardless of the engine's number.
  const bestCp = toCentipawns(evalBefore.lines[0]?.score)
  const actualCp = ctx.isCheckmate ? MATE_SCORE : -toCentipawns(evalAfter.lines[0]?.score)
  const cpLoss = Math.max(0, bestCp - actualCp)

  // Conservative heuristic — Brilliant: the engine's own top move that hands
  // the opponent a real piece (minor or better) yet stays at least equal.
  // `grabbed < sacrificed` rules out ordinary trades and winning captures.
  if (isBestMove && actualCp >= 0) {
    const sacrificed = capturedValue(ctx.fenAfter, evalAfter.bestMove)
    const grabbed = capturedValue(ctx.fenBefore, ctx.moveUci)
    if (sacrificed >= 3 && grabbed < sacrificed)
      return { classification: MoveClassification.Brilliant, cpLoss }
  }

  // Conservative heuristic — Great: the engine's top move when every
  // alternative was far worse, i.e. the only move that held the position.
  if (isBestMove && evalBefore.lines.length >= 2) {
    const gap = toCentipawns(evalBefore.lines[0]?.score) - toCentipawns(evalBefore.lines[1]?.score)
    if (gap >= GREAT_MIN_GAP)
      return { classification: MoveClassification.Great, cpLoss }
  }

  // Conservative heuristic — Miss: a clearly winning position was on the board
  // and this move threw the win away.
  if (!isBestMove && bestCp >= MISS_WINNING_CP && actualCp < MISS_LOST_CP)
    return { classification: MoveClassification.Miss, cpLoss }

  // Reliable centipawn-loss bands.
  if (isBestMove)
    return { classification: MoveClassification.Best, cpLoss }
  if (cpLoss < EXCELLENT_MAX_CP_LOSS)
    return { classification: MoveClassification.Excellent, cpLoss }
  if (cpLoss < GOOD_MAX_CP_LOSS)
    return { classification: MoveClassification.Good, cpLoss }
  if (cpLoss < INACCURACY_MAX_CP_LOSS)
    return { classification: MoveClassification.Inaccuracy, cpLoss }
  if (cpLoss < MISTAKE_MAX_CP_LOSS)
    return { classification: MoveClassification.Mistake, cpLoss }
  return { classification: MoveClassification.Blunder, cpLoss }
}
