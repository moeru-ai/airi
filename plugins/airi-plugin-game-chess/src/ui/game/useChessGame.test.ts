import { describe, expect, it } from 'vitest'

import { useChessGame } from './useChessGame'

/** White pawn one rank from promotion — used for promotion-flow fixtures. */
const PROMOTION_FEN = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1'
/** Fool's mate: Black queen on h4 has just mated the White king. */
const CHECKMATE_FEN = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3'
/** Black queen on h4 checks the White king on e1 down the a-diagonal. */
const CHECK_FEN = '4k3/8/8/8/7q/8/8/4K3 w - - 0 1'

/**
 * @example
 * useChessGame().turn.value // 'w'
 */
describe('useChessGame', () => {
  /**
   * @example
   * expect(game.cells.value.length).toBe(8)
   */
  it('builds an 8x8 board with the standard opening position', () => {
    const game = useChessGame()
    expect(game.cells.value.length).toBe(8)
    expect(game.cells.value.every(row => row.length === 8)).toBe(true)
    // game.board() yields rank 8 first, so a8 carries the black rook.
    expect(game.cells.value[0][0]).toEqual({ square: 'a8', piece: { type: 'r', color: 'b' } })
    expect(game.cells.value[3][0].piece).toBeNull()
    expect(game.turn.value).toBe('w')
    expect(game.status.value).toBe('playing')
  })

  /**
   * @example
   * game.selectSquare('e2'); expect(game.legalTargets.value.has('e4')).toBe(true)
   */
  it('selects an own piece and exposes its legal targets', () => {
    const game = useChessGame()
    game.selectSquare('e2')
    expect(game.selected.value).toBe('e2')
    expect(game.legalTargets.value.has('e3')).toBe(true)
    expect(game.legalTargets.value.has('e4')).toBe(true)
  })

  /**
   * @example
   * game.selectSquare('e7'); expect(game.selected.value).toBeNull()
   */
  it('ignores a first click on a square the side to move does not own', () => {
    const game = useChessGame()
    game.selectSquare('e7')
    expect(game.selected.value).toBeNull()
  })

  /**
   * @example
   * game.selectSquare('e2'); game.selectSquare('e4'); expect(game.turn.value).toBe('b')
   */
  it('applies a legal move on the second click and advances the turn', () => {
    const game = useChessGame()
    game.selectSquare('e2')
    game.selectSquare('e4')
    expect(game.selected.value).toBeNull()
    expect(game.turn.value).toBe('b')
    expect(game.lastMove.value).toEqual({ from: 'e2', to: 'e4' })
  })

  /**
   * @example
   * game.selectSquare('e2'); game.selectSquare('e2'); expect(game.selected.value).toBeNull()
   */
  it('clears the selection when the selected square is clicked again', () => {
    const game = useChessGame()
    game.selectSquare('e2')
    game.selectSquare('e2')
    expect(game.selected.value).toBeNull()
  })

  /**
   * @example
   * game.selectSquare('e2'); game.selectSquare('d2'); expect(game.selected.value).toBe('d2')
   */
  it('reselects another own piece instead of treating it as a move target', () => {
    const game = useChessGame()
    game.selectSquare('e2')
    game.selectSquare('d2')
    expect(game.selected.value).toBe('d2')
  })

  /**
   * @example
   * game.selectSquare('a7'); game.selectSquare('a8'); expect(game.pendingPromotion.value).not.toBeNull()
   */
  it('defers a promoting pawn move to a pending-promotion choice', () => {
    const game = useChessGame(PROMOTION_FEN)
    game.selectSquare('a7')
    game.selectSquare('a8')
    expect(game.pendingPromotion.value).toEqual({ from: 'a7', to: 'a8' })
    // The move is not yet on the board: White is still to move.
    expect(game.turn.value).toBe('w')

    game.choosePromotion('q')
    expect(game.pendingPromotion.value).toBeNull()
    expect(game.turn.value).toBe('b')
    expect(game.cells.value[0][0].piece).toEqual({ type: 'q', color: 'w' })
  })

  /**
   * @example
   * expect(useChessGame(CHECKMATE_FEN).status.value).toBe('checkmate')
   */
  it('reports checkmate and leaves no playable selection', () => {
    const game = useChessGame(CHECKMATE_FEN)
    expect(game.status.value).toBe('checkmate')
    game.selectSquare('e1')
    expect(game.legalTargets.value.size).toBe(0)
  })

  /**
   * @example
   * expect(useChessGame(CHECK_FEN).checkSquare.value).toBe('e1')
   */
  it('marks the checked king square while the side to move is in check', () => {
    const game = useChessGame(CHECK_FEN)
    expect(game.status.value).toBe('check')
    expect(game.checkSquare.value).toBe('e1')
  })

  /**
   * @example
   * expect(game.playMove('e2', 'e5')).toBe(false)
   */
  it('rejects an illegal move and keeps the position unchanged', () => {
    const game = useChessGame()
    expect(game.playMove('e2', 'e5')).toBe(false)
    expect(game.turn.value).toBe('w')
    expect(game.lastMove.value).toBeNull()
  })

  /**
   * @example
   * expect(game.lastMoveContext.value?.moveUci).toBe('e2e4')
   */
  it('exposes a move context with before/after FENs for the last move', () => {
    const game = useChessGame()
    expect(game.lastMoveContext.value).toBeNull()

    game.selectSquare('e2')
    game.selectSquare('e4')
    const ctx = game.lastMoveContext.value
    expect(ctx?.moveUci).toBe('e2e4')
    expect(ctx?.fenBefore).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')
    expect(ctx?.fenAfter).toContain(' b ')
    expect(ctx?.isCheck).toBe(false)
    expect(ctx?.isCheckmate).toBe(false)
  })

  /**
   * @example
   * expect(useChessGame(CHECKMATE_FEN)...) // after a mating move
   */
  it('flags checkmate in the move context of the mating move', () => {
    // Scholar's mate: Qf3xf7 is the mating move.
    const game = useChessGame('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 4 4')
    game.selectSquare('f3')
    game.selectSquare('f7')
    expect(game.status.value).toBe('checkmate')
    expect(game.lastMoveContext.value?.moveUci).toBe('f3f7')
    expect(game.lastMoveContext.value?.isCheck).toBe(true)
    expect(game.lastMoveContext.value?.isCheckmate).toBe(true)
  })

  /**
   * @example
   * game.reset(); expect(game.turn.value).toBe('w')
   */
  it('reset restores the standard starting position', () => {
    const game = useChessGame()
    game.selectSquare('e2')
    game.selectSquare('e4')
    game.reset()
    expect(game.turn.value).toBe('w')
    expect(game.selected.value).toBeNull()
    expect(game.lastMove.value).toBeNull()
  })
})
