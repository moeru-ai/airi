import type { Color, PieceSymbol, Square } from 'chess.js'

import type { MoveContext } from '../../schema'

import { Chess } from 'chess.js'
import { computed, ref } from 'vue'

/** A single board cell: its algebraic coordinate and the piece on it, if any. */
export interface BoardCell {
  square: Square
  piece: { type: PieceSymbol, color: Color } | null
}

/** A pawn move that has reached the last rank and awaits a promotion choice. */
export interface PendingPromotion {
  from: Square
  to: Square
}

/** Coarse game status surfaced to the board UI. */
export type GameStatus = 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw'

/**
 * Reactive chess game backed by chess.js, driving the board UI.
 *
 * Use when:
 * - The gamelet board component needs reactive position, selection and rules
 *
 * Expects:
 * - `initialFen`, when given, is a legal FEN accepted by chess.js
 *
 * Returns:
 * - Reactive refs for the board and selection plus the interaction methods
 *   `selectSquare`, `choosePromotion`, `playMove` and `reset`. chess.js owns
 *   all rule enforcement; this composable only adds Vue reactivity and the
 *   click-to-move selection state machine.
 */
export function useChessGame(initialFen?: string) {
  const game = initialFen ? new Chess(initialFen) : new Chess()
  // chess.js mutates in place and is not reactive; this ref is bumped after
  // every mutation so the computeds below recompute off the new position.
  const fen = ref(game.fen())
  const selected = ref<Square | null>(null)
  const pendingPromotion = ref<PendingPromotion | null>(null)

  function sync(): void {
    fen.value = game.fen()
  }

  const turn = computed<Color>(() => {
    void fen.value
    return game.turn()
  })

  const cells = computed<BoardCell[][]>(() => {
    void fen.value
    // game.board() yields rank 8 first; rebuild square names so empty cells
    // (which chess.js returns as null) still carry their coordinate.
    return game.board().map((row, rank) =>
      row.map((piece, file) => ({
        square: `${String.fromCharCode(97 + file)}${8 - rank}` as Square,
        piece: piece ? { type: piece.type, color: piece.color } : null,
      })),
    )
  })

  const legalTargets = computed<Set<Square>>(() => {
    void fen.value
    if (!selected.value)
      return new Set()
    return new Set(game.moves({ square: selected.value, verbose: true }).map(move => move.to))
  })

  const lastMove = computed<{ from: Square, to: Square } | null>(() => {
    void fen.value
    const history = game.history({ verbose: true })
    const last = history.at(-1)
    return last ? { from: last.from, to: last.to } : null
  })

  // chess.js verbose moves carry `before`/`after` FENs and `lan` (UCI-style)
  // notation; `game` currently sits on the post-move position, so its
  // check/checkmate flags describe the effect of this same last move.
  const lastMoveContext = computed<MoveContext | null>(() => {
    void fen.value
    const last = game.history({ verbose: true }).at(-1)
    if (!last)
      return null
    return {
      fenBefore: last.before,
      fenAfter: last.after,
      moveUci: last.lan,
      isCheck: game.isCheck(),
      isCheckmate: game.isCheckmate(),
    }
  })

  const status = computed<GameStatus>(() => {
    void fen.value
    if (game.isCheckmate())
      return 'checkmate'
    if (game.isStalemate())
      return 'stalemate'
    if (game.isDraw())
      return 'draw'
    if (game.isCheck())
      return 'check'
    return 'playing'
  })

  /** Square of the side-to-move's king while it is in check, for highlighting. */
  const checkSquare = computed<Square | null>(() => {
    void fen.value
    if (!game.isCheck())
      return null
    for (const row of game.board()) {
      for (const piece of row) {
        if (piece && piece.type === 'k' && piece.color === game.turn())
          return piece.square
      }
    }
    return null
  })

  function pieceColorAt(square: Square): Color | null {
    const piece = game.get(square)
    return piece ? piece.color : null
  }

  /** True when moving `from`->`to` is a pawn promotion in the current position. */
  function isPromotion(from: Square, to: Square): boolean {
    return game.moves({ square: from, verbose: true })
      .some(move => move.to === to && move.promotion !== undefined)
  }

  /**
   * Applies a move; returns false when chess.js rejects it as illegal.
   */
  function playMove(from: Square, to: Square, promotion?: PieceSymbol): boolean {
    try {
      game.move({ from, to, promotion })
      selected.value = null
      pendingPromotion.value = null
      sync()
      return true
    }
    catch {
      return false
    }
  }

  /**
   * Drives click-to-move: first click selects an own piece, second click moves
   * to a legal target, reselects another own piece, or clears the selection.
   */
  function selectSquare(square: Square): void {
    if (pendingPromotion.value)
      return

    const current = selected.value
    if (current === null) {
      if (pieceColorAt(square) === game.turn())
        selected.value = square
      return
    }

    if (square === current) {
      selected.value = null
      return
    }

    if (legalTargets.value.has(square)) {
      if (isPromotion(current, square))
        pendingPromotion.value = { from: current, to: square }
      else
        playMove(current, square)
      return
    }

    selected.value = pieceColorAt(square) === game.turn() ? square : null
  }

  /** Completes a pending promotion with the chosen piece. */
  function choosePromotion(piece: PieceSymbol): void {
    const pending = pendingPromotion.value
    if (pending)
      playMove(pending.from, pending.to, piece)
  }

  /** Resets to the standard starting position. */
  function reset(): void {
    game.reset()
    selected.value = null
    pendingPromotion.value = null
    sync()
  }

  return {
    fen,
    turn,
    cells,
    selected,
    legalTargets,
    lastMove,
    lastMoveContext,
    checkSquare,
    status,
    pendingPromotion,
    selectSquare,
    choosePromotion,
    playMove,
    reset,
  }
}

/** Aggregate reactive state and methods returned by {@link useChessGame}. */
export type ChessGame = ReturnType<typeof useChessGame>
