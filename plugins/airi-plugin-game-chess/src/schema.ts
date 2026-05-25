import * as v from 'valibot'

/**
 * The ten move-quality labels used by the coach, mirroring the categories shown
 * in chess.com's Game Review.
 *
 * The string values are a stable contract: engine analysis, the LLM tools, the
 * board UI, and the persona prompts all key off these exact values. Treat any
 * change here as a breaking change.
 */
export enum MoveClassification {
  /** A hard-to-find move, typically a sound sacrifice, that is also near-best. */
  Brilliant = 'brilliant',
  /** The only move that keeps the advantage in a critical position. */
  Great = 'great',
  /** Matches the engine's top choice. */
  Best = 'best',
  /** Within a few centipawns of the best move. */
  Excellent = 'excellent',
  /** A reasonable move with a small centipawn loss. */
  Good = 'good',
  /** A known opening-theory move. */
  Book = 'book',
  /** A slightly weak move. */
  Inaccuracy = 'inaccuracy',
  /** A move that gives away a meaningful part of the advantage. */
  Mistake = 'mistake',
  /** Failed to play an available winning or far stronger continuation. */
  Miss = 'miss',
  /** A move that loses material or the game outright. */
  Blunder = 'blunder',
}

/**
 * A position evaluation reported by Stockfish.
 *
 * Exactly one of {@link EngineScore.cp} or {@link EngineScore.mate} is non-null.
 * Both are from the perspective of the side to move in the analysed position.
 */
export interface EngineScore {
  /** Centipawn advantage for the side to move; null when a forced mate is seen. */
  cp: number | null
  /** Signed plies-to-mate (positive = side to move mates); null when no mate is seen. */
  mate: number | null
}

/**
 * One principal variation returned by Stockfish for a position.
 */
export interface EngineLine {
  /** Evaluation at the end of {@link EngineLine.pv}. */
  score: EngineScore
  /** Best continuation as UCI move strings, best move first. */
  pv: string[]
  /** Search depth this line was computed at. */
  depth: number
  /** 1-based MultiPV rank; rank 1 is the engine's preferred line. */
  rank: number
}

/**
 * The full result of analysing a single position.
 */
export interface AnalysisResult {
  /** FEN of the analysed position. */
  fen: string
  /** Deepest search depth reached. */
  depth: number
  /** Lines ordered best-first; length equals the requested MultiPV. */
  lines: EngineLine[]
  /** UCI string of the engine's preferred move; equals `lines[0].pv[0]`. */
  bestMove: string
}

/**
 * Everything {@link ClassifiedMove} classification needs about one played move.
 *
 * Produced by the game-state layer after a move is applied with chess.js, so
 * the FENs and flags are already rule-validated by the time they arrive here.
 */
export interface MoveContext {
  /** FEN of the position before the move. */
  fenBefore: string
  /** FEN of the position after the move. */
  fenAfter: string
  /** The played move in UCI notation, e.g. "e2e4" or "e7e8q". */
  moveUci: string
  /** Whether the move gives check. */
  isCheck: boolean
  /** Whether the move delivers checkmate. */
  isCheckmate: boolean
}

/**
 * The coach's verdict on one played move.
 */
export interface ClassifiedMove {
  /** Quality label for the move. */
  classification: MoveClassification
  /** Centipawns lost relative to the engine's best move; always >= 0. */
  cpLoss: number
}

function hasValidFenPiecePlacement(fen: string): boolean {
  const placement = fen.split(' ')[0]
  const ranks = placement.split('/')
  if (ranks.length !== 8)
    return false

  return ranks.every((rank) => {
    let squareCount = 0
    let previousWasDigit = false

    for (const char of rank) {
      if (/^[1-8]$/.test(char)) {
        if (previousWasDigit)
          return false
        squareCount += Number(char)
        previousWasDigit = true
      }
      else if (/^[PNBRQK]$/i.test(char)) {
        squareCount += 1
        previousWasDigit = false
      }
      else {
        return false
      }

      if (squareCount > 8)
        return false
    }

    return squareCount === 8
  })
}

/**
 * Validates that a string is a structurally well-formed standard FEN.
 *
 * Use at the engine input boundary so a malformed FEN never reaches Stockfish,
 * where it could stall the UCI search. This checks structure only, not legality
 * of the position (chess.js owns legality).
 */
export const fenSchema = v.pipe(
  v.string(),
  // Six space-separated fields: 8 ranks of piece placement, side to move,
  // castling rights, en passant target, halfmove clock, fullmove number.
  v.regex(
    /^([1-8PNBRQKpnbrqk]+\/){7}[1-8PNBRQKpnbrqk]+ [wb] (?:-|(?=[KQkq])K?Q?k?q?) (?:-|[a-h][36]) \d+ [1-9]\d*$/,
    'Malformed FEN string.',
  ),
  v.check(hasValidFenPiecePlacement, 'Malformed FEN string.'),
)
