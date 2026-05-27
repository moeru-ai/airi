import type { Color } from 'chess.js'
import type { Ref } from 'vue'

import type { EngineReview } from '../engine/useEngineReview'
import type { ChessGame } from './useChessGame'

import { errorMessageFrom } from '@moeru/std'
import { computed, ref } from 'vue'

/** Opponent modes the board supports. */
export type OpponentMode = 'manual' | 'stockfish'

/** Coarse engine strength selector, mapped to a fixed Stockfish search depth. */
export type EngineStrength = 'beginner' | 'intermediate' | 'strong' | 'monster'

/** Stockfish depth per strength bucket. */
const STRENGTH_DEPTH: Record<EngineStrength, number> = {
  beginner: 5,
  intermediate: 10,
  strong: 15,
  monster: 20,
}

/** Reactive view returned by {@link useChessOpponent}. */
export interface ChessOpponent {
  /** Active opponent mode. Default `'manual'` (pass-and-play). */
  mode: Ref<OpponentMode>
  /** Side the human is playing. Default `'w'`. */
  userColor: Ref<Color>
  /** Coarse strength for the Stockfish opponent. Default `'intermediate'`. */
  strength: Ref<EngineStrength>
  /**
   * Optional Stockfish `Skill Level` 0–20 forwarded to the engine on each move.
   * Companion mode drives this from the AIRI level so weak AIRI plays badly on
   * purpose; Coach mode leaves it `undefined` for full-strength play.
   */
  skillLevel: Ref<number | undefined>
  /** True while the engine is computing its own move (input should be soft-locked). */
  thinking: Ref<boolean>
  /** True while the human should not be allowed to move pieces. */
  inputLocked: Readonly<Ref<boolean>>
  /** Whether the most recently emitted move was played by the engine opponent. */
  isEngineMove: (mover: 'white' | 'black') => boolean
  /** Resolves with the engine's next move when it should respond now; no-op otherwise. */
  maybeRespond: () => Promise<void>
}

/**
 * Manages the chess opponent layer on top of {@link ChessGame}.
 *
 * Use when:
 * - The board offers a play-vs-engine mode and the engine must take its turn
 *   automatically after the human plays
 *
 * Expects:
 * - `engine.analyzeOpponentMove` is callable once the opponent engine is ready
 * - `game.playMove` accepts UCI from/to/promotion strings
 *
 * Returns:
 * - A {@link ChessOpponent}. {@link ChessOpponent.maybeRespond} reads the
 *   current turn against `userColor` and only fires when it really is the
 *   engine's turn in `stockfish` mode and the game is still playable.
 */
export function useChessOpponent(game: ChessGame, engine: EngineReview): ChessOpponent {
  const mode = ref<OpponentMode>('manual')
  const userColor = ref<Color>('w')
  const strength = ref<EngineStrength>('intermediate')
  const skillLevel = ref<number | undefined>(undefined)
  const thinking = ref(false)
  let responseSeq = 0

  function engineColor(): Color {
    return userColor.value === 'w' ? 'b' : 'w'
  }

  function isEngineMove(mover: 'white' | 'black'): boolean {
    if (mode.value !== 'stockfish')
      return false
    const moverShort: Color = mover === 'white' ? 'w' : 'b'
    return moverShort === engineColor()
  }

  const inputLocked = computed(() => {
    if (thinking.value)
      return true
    if (game.status.value !== 'playing' && game.status.value !== 'check')
      return true
    return mode.value === 'stockfish' && game.turn.value === engineColor()
  })

  async function maybeRespond(): Promise<void> {
    if (mode.value !== 'stockfish')
      return
    if (!engine.opponentReady.value)
      return
    if (game.status.value !== 'playing' && game.status.value !== 'check')
      return
    if (game.turn.value !== engineColor())
      return
    if (thinking.value)
      return

    const seq = ++responseSeq
    const fenAtStart = game.fen.value
    const engineColorAtStart = engineColor()
    thinking.value = true
    try {
      const result = await engine.analyzeOpponentMove(fenAtStart, STRENGTH_DEPTH[strength.value], skillLevel.value)
      if (seq !== responseSeq)
        return
      if (mode.value !== 'stockfish' || game.fen.value !== fenAtStart || game.turn.value !== engineColorAtStart)
        return
      const uci = result.bestMove
      if (!uci)
        return
      // UCI move: 4 chars (e2e4) or 5 chars with promotion (e7e8q).
      game.playMove(
        uci.slice(0, 2) as Parameters<typeof game.playMove>[0],
        uci.slice(2, 4) as Parameters<typeof game.playMove>[1],
        uci.length > 4 ? uci.slice(4, 5) as Parameters<typeof game.playMove>[2] : undefined,
      )
    }
    catch (error) {
      console.error('[useChessOpponent] engine move failed:', errorMessageFrom(error))
    }
    finally {
      if (seq === responseSeq)
        thinking.value = false
    }
  }

  return { mode, userColor, strength, skillLevel, thinking, inputLocked, isEngineMove, maybeRespond }
}
