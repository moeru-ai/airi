import type { Ref } from 'vue'

import type { AnalysisResult, ClassifiedMove, MoveContext } from '../../schema'

import { errorMessageFrom } from '@moeru/std'
import { Chess } from 'chess.js'
import { onMounted, onScopeDispose, ref, shallowRef } from 'vue'

import { classifyMove } from '../../classify/classifyMove'
import { AnalysisSupersededError, createStockfishEngine } from '../../engine/stockfishEngine'
import { createWorkerTransport } from './workerTransport'

type StockfishEngineHandle = ReturnType<typeof createStockfishEngine>

/** Fixed search depth per reviewed move — deep enough to teach, fast on lite-single. */
const REVIEW_DEPTH = 14
/** MultiPV for the pre-move position; >1 feeds the great/miss heuristics in `classifyMove`. */
const REVIEW_MULTIPV = 3
/** Centipawn stand-in for a forced mate, so evaluations stay plain numbers. */
const MATE_CP = 100_000

/**
 * Folds an engine evaluation of the post-move position into a single
 * White-perspective centipawn number, mapping forced mates to {@link MATE_CP}.
 *
 * Before:
 * - `{ cp: 80, mate: null }` reported with Black to move
 *
 * After:
 * - `-80` (positive always favours White)
 */
function whiteEvalAfter(context: MoveContext, after: AnalysisResult): number {
  const whiteToMove = context.fenAfter.split(' ')[1] === 'w'
  const sign = whiteToMove ? 1 : -1
  // A delivered checkmate has no post-move lines; the side to move is mated.
  if (context.isCheckmate)
    return -sign * MATE_CP
  const score = after.lines[0]?.score
  if (!score)
    return 0
  if (score.mate !== null)
    return sign * (score.mate > 0 ? MATE_CP : -MATE_CP)
  return sign * (score.cp ?? 0)
}

/**
 * Replays one UCI move with chess.js to recover the full {@link MoveContext}
 * the engine review needs (the after-FEN and check flags).
 *
 * Before:
 * - `fenBefore` plus `"e7e8q"`
 *
 * After:
 * - `{ fenBefore, fenAfter, moveUci: "e7e8q", isCheck, isCheckmate }`
 *
 * Throws when the move is illegal in `fenBefore`.
 */
function moveContextFromUci(fenBefore: string, moveUci: string): MoveContext {
  const chess = new Chess(fenBefore)
  chess.move({
    from: moveUci.slice(0, 2),
    to: moveUci.slice(2, 4),
    promotion: moveUci.length > 4 ? moveUci.slice(4, 5) : undefined,
  })
  return {
    fenBefore,
    fenAfter: chess.fen(),
    moveUci,
    isCheck: chess.isCheck(),
    isCheckmate: chess.isCheckmate(),
  }
}

/**
 * Reactive handle returned by {@link useEngineReview}.
 */
export interface EngineReview {
  /** True once the review/tool engine UCI handshake has completed. */
  ready: Ref<boolean>
  /** True once the separate opponent engine UCI handshake has completed. */
  opponentReady: Ref<boolean>
  /** True while a position pair is being analysed. */
  analyzing: Ref<boolean>
  /** Last review/tool engine error message, or null when healthy. */
  error: Ref<string | null>
  /** Last opponent engine error message, or null when healthy. */
  opponentError: Ref<string | null>
  /** Classification of the most recently reviewed move, or null when none applies. */
  lastMove: Ref<ClassifiedMove | null>
  /** Evaluation after the last reviewed move, in centipawns from White's perspective. */
  evaluation: Ref<number | null>
  /**
   * Reviews one played move; passing null clears {@link EngineReview.lastMove}.
   * Resolves with the classification, or null when nothing was classified
   * (engine not ready, cleared, or the request was superseded).
   */
  review: (context: MoveContext | null) => Promise<ClassifiedMove | null>
  /**
   * Analyses an arbitrary position; backs the `analyze_position` tool and the
   * Companion-mode opponent. `skillLevel` weakens engine play (0–20, default
   * 20 = full strength); omit for full-strength analysis.
   */
  analyzePosition: (fen: string, depth?: number, multipv?: number, skillLevel?: number) => Promise<AnalysisResult>
  /**
   * Analyses one position on the opponent-only engine, so engine move
   * generation cannot supersede in-flight review/tool analysis.
   */
  analyzeOpponentMove: (fen: string, depth?: number, skillLevel?: number) => Promise<AnalysisResult>
  /** Classifies a move given only its start FEN and UCI; backs the `explain_move` tool. */
  explainMove: (fenBefore: string, moveUci: string) => Promise<ClassifiedMove>
}

/**
 * Boots a Stockfish engine in the gamelet and exposes both reactive per-move
 * review and one-shot analysis for the host-forwarded tools.
 *
 * Use when:
 * - A board component needs per-move quality feedback (best/blunder/...)
 * - The host bridge needs to answer `analyze_position` / `explain_move`
 *
 * Expects:
 * - Called from a component setup so `onMounted`/`onScopeDispose` bind to its
 *   lifecycle; the engine boots on mount and is disposed on unmount
 *
 * Returns:
 * - An {@link EngineReview}. Review/tool requests share one latest-wins engine;
 *   opponent move generation uses a second engine so gameplay never interrupts
 *   a coach review and a tool call never cancels the opponent's move.
 */
export function useEngineReview(): EngineReview {
  const ready = ref(false)
  const opponentReady = ref(false)
  const analyzing = ref(false)
  const error = ref<string | null>(null)
  const opponentError = ref<string | null>(null)
  const lastMove = shallowRef<ClassifiedMove | null>(null)
  const evaluation = ref<number | null>(null)

  const reviewEngine = createStockfishEngine(createWorkerTransport())
  const opponentEngine = createStockfishEngine(createWorkerTransport())

  // Monotonic id so a superseded review never resurrects stale UI state.
  let reviewSeq = 0

  function bootEngine(engine: StockfishEngineHandle, targetReady: Ref<boolean>, targetError: Ref<string | null>, fallbackMessage: string): void {
    engine.init()
      .then(() => { targetReady.value = true })
      .catch((bootError) => { targetError.value = errorMessageFrom(bootError) ?? fallbackMessage })
  }

  onMounted(() => {
    bootEngine(reviewEngine, ready, error, 'Review engine failed to start.')
    bootEngine(opponentEngine, opponentReady, opponentError, 'Opponent engine failed to start.')
  })
  onScopeDispose(() => {
    reviewEngine.dispose()
    opponentEngine.dispose()
  })

  // Shared analysis core: evaluate the position before and after the move,
  // classify it, and fold the post-move evaluation to White's perspective.
  async function runReview(context: MoveContext): Promise<{ classified: ClassifiedMove, whiteEvalCp: number }> {
    const before = await reviewEngine.analyze(context.fenBefore, { depth: REVIEW_DEPTH, multipv: REVIEW_MULTIPV })
    // A checkmating move ends the game: there is no legal reply to analyse,
    // and `classifyMove` handles the empty post-move result on its own.
    const after: AnalysisResult = context.isCheckmate
      ? { fen: context.fenAfter, depth: 0, lines: [], bestMove: '' }
      : await reviewEngine.analyze(context.fenAfter, { depth: REVIEW_DEPTH, multipv: 1 })
    return { classified: classifyMove(context, before, after), whiteEvalCp: whiteEvalAfter(context, after) }
  }

  async function review(context: MoveContext | null): Promise<ClassifiedMove | null> {
    if (context === null) {
      reviewSeq += 1
      analyzing.value = false
      lastMove.value = null
      evaluation.value = null
      return null
    }
    if (!ready.value)
      return null

    const seq = ++reviewSeq
    analyzing.value = true
    error.value = null
    try {
      const { classified, whiteEvalCp } = await runReview(context)
      if (seq !== reviewSeq)
        return null
      lastMove.value = classified
      evaluation.value = whiteEvalCp
      return classified
    }
    catch (reviewError) {
      if (seq !== reviewSeq)
        return null
      // A newer move replaced this analysis — expected; keep the prior label.
      if (reviewError instanceof AnalysisSupersededError)
        return null
      error.value = errorMessageFrom(reviewError) ?? 'Engine analysis failed.'
      return null
    }
    finally {
      if (seq === reviewSeq)
        analyzing.value = false
    }
  }

  async function analyzePosition(fen: string, depth?: number, multipv?: number, skillLevel?: number): Promise<AnalysisResult> {
    return reviewEngine.analyze(fen, { depth: depth ?? REVIEW_DEPTH, multipv: multipv ?? 1, skillLevel })
  }

  async function analyzeOpponentMove(fen: string, depth?: number, skillLevel?: number): Promise<AnalysisResult> {
    return opponentEngine.analyze(fen, { depth: depth ?? REVIEW_DEPTH, multipv: 1, skillLevel })
  }

  async function explainMove(fenBefore: string, moveUci: string): Promise<ClassifiedMove> {
    const { classified } = await runReview(moveContextFromUci(fenBefore, moveUci))
    return classified
  }

  return {
    ready,
    opponentReady,
    analyzing,
    error,
    opponentError,
    lastMove,
    evaluation,
    review,
    analyzePosition,
    analyzeOpponentMove,
    explainMove,
  }
}
