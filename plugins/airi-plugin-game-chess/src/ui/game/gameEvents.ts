import type { MoveClassification } from '../../schema'
import type { GameStatus } from './useChessGame'

/** Side of the board, spelled out for prompt-facing event payloads. */
export type PlayerColor = 'white' | 'black'

/** How a finished game ended. */
export type GameResult = 'checkmate' | 'stalemate' | 'draw'

/**
 * One semantic event surfaced by the game session to the coaching layer.
 *
 * This is the gamelet half of the 17-event contract: the ten move-quality
 * labels are folded into a single {@link kind} `'move'` event keyed by
 * `classification`, alongside `in_check` and the six dialogue events. The host
 * bridge (stage 4.5) forwards these to the LLM/persona layer.
 */
export type SemanticEvent
  /** The coach should greet the user once, when the gamelet session opens. */
  = | { kind: 'session_greeting' }
  /** A fresh game has begun (initial load or after a reset). */
    | { kind: 'game_start' }
  /** The move just played put the opposing king in check (not mate). */
    | { kind: 'in_check' }
  /** No move has been made for the long-think threshold while the game is live. */
    | { kind: 'user_idle' }
  /** A move was played and classified; carries its quality label. */
    | { kind: 'move', classification: MoveClassification, cpLoss: number, moveUci: string, mover: PlayerColor }
  /** The decisive advantage changed hands on the last move. */
    | { kind: 'momentum_swing', fromCp: number, toCp: number }
  /** The last move delivered checkmate. */
    | { kind: 'checkmate', winner: PlayerColor }
  /** The game has ended; `winner` is null for a draw or stalemate. */
    | { kind: 'game_end', result: GameResult, winner: PlayerColor | null }

/**
 * Everything {@link createGameSession} needs about one reviewed move.
 *
 * Assembled by the composable layer after a move is applied and the engine has
 * classified it, so every field is already rule- and engine-validated.
 */
export interface MoveReview {
  /** Quality label from {@link classifyMove}. */
  classification: MoveClassification
  /** Centipawns lost relative to the engine's best move; always >= 0. */
  cpLoss: number
  /** The played move in UCI notation. */
  moveUci: string
  /** The side that played the move. */
  mover: PlayerColor
  /** Whether the move gives check. */
  isCheck: boolean
  /** Whether the move delivers checkmate. */
  isCheckmate: boolean
  /** Coarse game status of the resulting position. */
  status: GameStatus
  /** Engine evaluation after the move, in centipawns from White's perspective. */
  whiteEvalCp: number
}
