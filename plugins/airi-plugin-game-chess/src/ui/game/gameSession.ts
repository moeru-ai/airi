import type { MoveReview, PlayerColor, SemanticEvent } from './gameEvents'

/**
 * Schedules a one-shot delayed callback.
 *
 * Injected so the idle-timer policy can be driven by fake timers in tests
 * without touching `setTimeout` directly.
 */
export interface SessionTimer {
  /** Runs `callback` after `delayMs`; the returned function cancels it. */
  schedule: (delayMs: number, callback: () => void) => () => void
}

/**
 * Construction options for {@link createGameSession}.
 */
export interface GameSessionOptions {
  /** Sink for every emitted {@link SemanticEvent}. */
  emit: (event: SemanticEvent) => void
  /** Timer used to arm the {@link SemanticEvent} `user_idle` long-think threshold. */
  timer: SessionTimer
  /**
   * Picks the next idle delay in milliseconds. Re-evaluated on every arm so the
   * threshold varies per wait.
   * @default a uniform random value in [40000, 60000]
   */
  idleDelayMs?: () => number
}

/**
 * Drives the dialogue-event half of the gamelet's event contract.
 */
export interface GameSession {
  /** Opens the session: emits `session_greeting` then `game_start`, arms idle. */
  begin: () => void
  /** Feeds one reviewed move through the event rules. */
  submitMove: (review: MoveReview) => void
  /** Starts a fresh game after a reset: emits `game_start`, re-arms idle. */
  restart: () => void
  /** Cancels the idle timer; call on teardown. */
  dispose: () => void
}

/** Centipawn margin above which one side is treated as decisively ahead. */
const DECISIVE_CP = 150

/** Default idle threshold: a uniform random long-think window of 40–60 seconds. */
function defaultIdleDelayMs(): number {
  return 40_000 + Math.floor(Math.random() * 20_001)
}

/**
 * Returns true when the decisive advantage flipped sides between two
 * evaluations, e.g. White was winning ({@link DECISIVE_CP}+) and now Black is.
 * Both arguments are centipawns from White's perspective.
 */
function decisiveAdvantageFlipped(fromCp: number, toCp: number): boolean {
  return (fromCp >= DECISIVE_CP && toCp <= -DECISIVE_CP)
    || (fromCp <= -DECISIVE_CP && toCp >= DECISIVE_CP)
}

/**
 * Creates the gamelet game session — the state machine that turns raw game
 * progress into dialogue-oriented {@link SemanticEvent}s.
 *
 * Use when:
 * - The gamelet UI needs `session_greeting`/`game_start`/`game_end`/`checkmate`/
 *   `user_idle`/`momentum_swing`/`in_check` events alongside move classifications
 *
 * Expects:
 * - {@link GameSession.begin} is called once before any {@link GameSession.submitMove}
 * - Moves are submitted in play order
 *
 * Returns:
 * - A {@link GameSession}. The idle timer is armed after `begin`, every
 *   `submitMove`, and every `restart`; it re-arms itself after firing so a long
 *   game can surface `user_idle` repeatedly, and stops once a game ends.
 */
export function createGameSession(options: GameSessionOptions): GameSession {
  const { emit, timer } = options
  const idleDelayMs = options.idleDelayMs ?? defaultIdleDelayMs

  let cancelIdle: (() => void) | null = null
  let gameOver = false
  // White-perspective centipawns after the previous move, for momentum checks.
  let lastWhiteEvalCp: number | null = null

  function clearIdle(): void {
    cancelIdle?.()
    cancelIdle = null
  }

  function armIdle(): void {
    clearIdle()
    if (gameOver)
      return
    cancelIdle = timer.schedule(idleDelayMs(), () => {
      cancelIdle = null
      emit({ kind: 'user_idle' })
      // Re-arm so a still-idle user is nudged again after a fresh window.
      armIdle()
    })
  }

  function begin(): void {
    gameOver = false
    lastWhiteEvalCp = null
    emit({ kind: 'session_greeting' })
    emit({ kind: 'game_start' })
    armIdle()
  }

  function restart(): void {
    gameOver = false
    lastWhiteEvalCp = null
    emit({ kind: 'game_start' })
    armIdle()
  }

  function submitMove(review: MoveReview): void {
    clearIdle()

    emit({
      kind: 'move',
      classification: review.classification,
      cpLoss: review.cpLoss,
      moveUci: review.moveUci,
      mover: review.mover,
    })

    if (review.isCheck && !review.isCheckmate)
      emit({ kind: 'in_check' })

    if (lastWhiteEvalCp !== null && decisiveAdvantageFlipped(lastWhiteEvalCp, review.whiteEvalCp))
      emit({ kind: 'momentum_swing', fromCp: lastWhiteEvalCp, toCp: review.whiteEvalCp })
    lastWhiteEvalCp = review.whiteEvalCp

    if (review.status === 'playing' || review.status === 'check') {
      armIdle()
      return
    }

    // Terminal position: announce the ending and stop nudging the user.
    gameOver = true
    if (review.status === 'checkmate') {
      const winner: PlayerColor = review.mover
      emit({ kind: 'checkmate', winner })
      emit({ kind: 'game_end', result: 'checkmate', winner })
      return
    }
    emit({ kind: 'game_end', result: review.status, winner: null })
  }

  function dispose(): void {
    clearIdle()
  }

  return { begin, submitMove, restart, dispose }
}
