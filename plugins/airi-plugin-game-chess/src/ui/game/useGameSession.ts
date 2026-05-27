import type { Ref } from 'vue'

import type { EngineReview } from '../engine/useEngineReview'
import type { SemanticEvent } from './gameEvents'
import type { ChessGame } from './useChessGame'

import { onMounted, onScopeDispose, ref, watch } from 'vue'

import { createGameSession } from './gameSession'

/** How many recent events the in-UI log keeps. */
const EVENT_LOG_LIMIT = 8

/** Options for {@link useGameSession}. */
export interface GameSessionOptions {
  /** Side-effect sink for every emitted event, e.g. the host bridge publisher. */
  onEvent?: (event: SemanticEvent) => void
  /**
   * Runs after one move has been reviewed and submitted. Used by the opponent
   * layer to take its turn once the just-played move's review has completed,
   * which keeps engine analyse calls serialised through the same engine.
   */
  onAfterMove?: () => void | Promise<void>
}

/** Reactive view returned by {@link useGameSession}. */
export interface GameSessionView {
  /** Rolling log of the most recent semantic events, oldest first. */
  events: Ref<SemanticEvent[]>
}

/**
 * Wires {@link createGameSession} to a live board and engine.
 *
 * Use when:
 * - A board component needs the gamelet's semantic event stream
 *   (greeting/start/end, idle, momentum, check, move classifications)
 *
 * Expects:
 * - Called from a component setup; binds to its mount/unmount lifecycle
 * - `game` and `engine` belong to the same board instance
 *
 * Returns:
 * - A {@link GameSessionView}. Each board move is run through the engine and
 *   fed to the session; a reset (null move context) restarts it. The idle
 *   timer is backed by `setTimeout`. Every event is mirrored to the optional
 *   {@link GameSessionOptions.onEvent} sink.
 */
export function useGameSession(game: ChessGame, engine: EngineReview, options: GameSessionOptions = {}): GameSessionView {
  const events = ref<SemanticEvent[]>([])

  const session = createGameSession({
    emit: (event) => {
      events.value = [...events.value, event].slice(-EVENT_LOG_LIMIT)
      options.onEvent?.(event)
    },
    timer: {
      schedule: (delayMs, callback) => {
        const handle = setTimeout(callback, delayMs)
        return () => clearTimeout(handle)
      },
    },
  })

  onMounted(() => session.begin())
  onScopeDispose(() => session.dispose())

  watch(game.lastMoveContext, async (context) => {
    // A null context means the board was reset back to a fresh game.
    if (context === null) {
      events.value = []
      await engine.review(null)
      session.restart()
      return
    }
    const classified = await engine.review(context)
    if (classified !== null) {
      session.submitMove({
        classification: classified.classification,
        cpLoss: classified.cpLoss,
        moveUci: context.moveUci,
        mover: context.fenBefore.split(' ')[1] === 'w' ? 'white' : 'black',
        isCheck: context.isCheck,
        isCheckmate: context.isCheckmate,
        status: game.status.value,
        whiteEvalCp: engine.evaluation.value ?? 0,
      })
    }
    await options.onAfterMove?.()
  })

  return { events }
}
