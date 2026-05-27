import { safeParse } from 'valibot'
import { describe, expect, it } from 'vitest'

import { fenSchema } from './schema'

/** Runs a FEN through {@link fenSchema} and reports only whether it passed. */
const isValidFen = (fen: string): boolean => safeParse(fenSchema, fen).success

/**
 * @example
 * isValidFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') // true
 */
describe('fenSchema', () => {
  /**
   * @example
   * expect(isValidFen('8/8/8/4k3/8/8/4K3/8 w - - 0 50')).toBe(true)
   */
  it('accepts well-formed standard FENs', () => {
    // Starting position.
    expect(isValidFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(true)
    // Canonical castling-right subsets.
    expect(isValidFen('r3k2r/8/8/8/8/8/8/R3K2R w KQk - 0 1')).toBe(true)
    expect(isValidFen('r3k2r/8/8/8/8/8/8/R3K2R w Qq - 0 1')).toBe(true)
    // After 1.e4 — carries an en passant target on rank 3.
    expect(isValidFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).toBe(true)
    // King-and-king endgame — no castling rights, no en passant.
    expect(isValidFen('8/8/8/4k3/8/8/4K3/8 w - - 0 50')).toBe(true)
    // All four castling rights still available.
    expect(isValidFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')).toBe(true)
  })

  /**
   * @example
   * expect(isValidFen('not a fen')).toBe(false)
   */
  it('rejects malformed FENs', () => {
    // Empty input.
    expect(isValidFen('')).toBe(false)
    // Free text.
    expect(isValidFen('not a fen')).toBe(false)
    // Only seven ranks of piece placement instead of eight.
    expect(isValidFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1')).toBe(false)
    // Side-to-move field is neither 'w' nor 'b'.
    expect(isValidFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1')).toBe(false)
    // Trailing fields (castling, en passant, clocks) are missing.
    expect(isValidFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w')).toBe(false)
    // A rank may not encode more than eight squares.
    expect(isValidFen('8/8/8/8/8/8/8/88 w - - 0 1')).toBe(false)
    // Empty runs must be canonical single digits, not adjacent digits.
    expect(isValidFen('11111111/8/8/8/8/8/8/8 w - - 0 1')).toBe(false)
    // Each rank must account for exactly eight squares.
    expect(isValidFen('7/8/8/8/8/8/8/8 w - - 0 1')).toBe(false)
    // Castling rights must be canonical and duplicate-free.
    expect(isValidFen('r3k2r/8/8/8/8/8/8/R3K2R w KK - 0 1')).toBe(false)
    expect(isValidFen('r3k2r/8/8/8/8/8/8/R3K2R w qK - 0 1')).toBe(false)
    // Fullmove number must be a positive integer.
    expect(isValidFen('8/8/8/8/8/8/8/8 w - - 0 0')).toBe(false)
  })
})
