import type { MoveReview, SemanticEvent } from './gameEvents'
import type { SessionTimer } from './gameSession'

import { describe, expect, it } from 'vitest'

import { MoveClassification } from '../../schema'
import { createGameSession } from './gameSession'

/** A controllable {@link SessionTimer} that records and manually fires callbacks. */
function fakeTimer(): { timer: SessionTimer, armedCount: () => number, fireLatest: () => void } {
  const scheduled: Array<{ callback: () => void, cancelled: boolean }> = []
  const timer: SessionTimer = {
    schedule(_delayMs, callback) {
      const entry = { callback, cancelled: false }
      scheduled.push(entry)
      return () => {
        entry.cancelled = true
      }
    },
  }
  return {
    timer,
    armedCount: () => scheduled.filter(entry => !entry.cancelled).length,
    fireLatest() {
      const entry = [...scheduled].reverse().find(item => !item.cancelled)
      if (entry) {
        entry.cancelled = true
        entry.callback()
      }
    },
  }
}

/** Builds a {@link MoveReview}, defaulting to a quiet, non-terminal good move. */
function moveReview(overrides: Partial<MoveReview> = {}): MoveReview {
  return {
    classification: MoveClassification.Good,
    cpLoss: 30,
    moveUci: 'e2e4',
    mover: 'white',
    isCheck: false,
    isCheckmate: false,
    status: 'playing',
    whiteEvalCp: 20,
    ...overrides,
  }
}

/**
 * @example
 * createGameSession({ emit, timer }).begin()
 */
describe('createGameSession', () => {
  /**
   * @example
   * expect(events.map(e => e.kind)).toEqual(['session_greeting', 'game_start'])
   */
  it('greets then starts the game on begin', () => {
    const events: SemanticEvent[] = []
    const { timer } = fakeTimer()
    createGameSession({ emit: e => events.push(e), timer }).begin()

    expect(events.map(event => event.kind)).toEqual(['session_greeting', 'game_start'])
  })

  /**
   * @example
   * expect(events.at(-1)).toMatchObject({ kind: 'move', classification: 'blunder' })
   */
  it('emits a move event carrying the classification and mover', () => {
    const events: SemanticEvent[] = []
    const { timer } = fakeTimer()
    const session = createGameSession({ emit: e => events.push(e), timer })
    session.begin()
    events.length = 0

    session.submitMove(moveReview({ classification: MoveClassification.Blunder, cpLoss: 320, mover: 'black' }))
    expect(events).toEqual([
      { kind: 'move', classification: MoveClassification.Blunder, cpLoss: 320, moveUci: 'e2e4', mover: 'black' },
    ])
  })

  /**
   * @example
   * expect(events.some(e => e.kind === 'in_check')).toBe(true)
   */
  it('emits in_check for a checking move but not for a mating move', () => {
    const events: SemanticEvent[] = []
    const { timer } = fakeTimer()
    const session = createGameSession({ emit: e => events.push(e), timer })
    session.begin()
    events.length = 0

    session.submitMove(moveReview({ isCheck: true, status: 'check' }))
    expect(events.some(event => event.kind === 'in_check')).toBe(true)

    events.length = 0
    session.submitMove(moveReview({ isCheck: true, isCheckmate: true, status: 'checkmate' }))
    expect(events.some(event => event.kind === 'in_check')).toBe(false)
  })

  /**
   * @example
   * expect(events.at(-1)).toMatchObject({ kind: 'game_end', result: 'checkmate' })
   */
  it('emits checkmate and game_end with the mover as winner', () => {
    const events: SemanticEvent[] = []
    const { timer } = fakeTimer()
    const session = createGameSession({ emit: e => events.push(e), timer })
    session.begin()
    events.length = 0

    session.submitMove(moveReview({ isCheck: true, isCheckmate: true, status: 'checkmate', mover: 'white' }))
    expect(events).toContainEqual({ kind: 'checkmate', winner: 'white' })
    expect(events).toContainEqual({ kind: 'game_end', result: 'checkmate', winner: 'white' })
  })

  /**
   * @example
   * expect(events.at(-1)).toMatchObject({ kind: 'game_end', result: 'draw', winner: null })
   */
  it('emits a winner-less game_end for a draw', () => {
    const events: SemanticEvent[] = []
    const { timer } = fakeTimer()
    const session = createGameSession({ emit: e => events.push(e), timer })
    session.begin()
    events.length = 0

    session.submitMove(moveReview({ status: 'draw' }))
    expect(events).toContainEqual({ kind: 'game_end', result: 'draw', winner: null })
  })

  /**
   * @example
   * expect(events.filter(e => e.kind === 'user_idle')).toHaveLength(2)
   */
  it('fires user_idle on timeout and re-arms for the next window', () => {
    const events: SemanticEvent[] = []
    const { timer, armedCount, fireLatest } = fakeTimer()
    createGameSession({ emit: e => events.push(e), timer, idleDelayMs: () => 50_000 }).begin()
    expect(armedCount()).toBe(1)

    fireLatest()
    fireLatest()
    expect(events.filter(event => event.kind === 'user_idle')).toHaveLength(2)
    expect(armedCount()).toBe(1)
  })

  /**
   * @example
   * expect(events.some(e => e.kind === 'momentum_swing')).toBe(true)
   */
  it('emits momentum_swing when the decisive advantage changes hands', () => {
    const events: SemanticEvent[] = []
    const { timer } = fakeTimer()
    const session = createGameSession({ emit: e => events.push(e), timer })
    session.begin()

    // First move sets the baseline — no prior eval, so no swing.
    session.submitMove(moveReview({ whiteEvalCp: 300 }))
    expect(events.some(event => event.kind === 'momentum_swing')).toBe(false)

    // White's +300 collapses to Black's -300: the advantage flipped.
    session.submitMove(moveReview({ whiteEvalCp: -300 }))
    expect(events).toContainEqual({ kind: 'momentum_swing', fromCp: 300, toCp: -300 })
  })

  /**
   * @example
   * expect(events.map(e => e.kind)).toEqual(['game_start'])
   */
  it('does not flag a momentum swing for a minor evaluation change', () => {
    const events: SemanticEvent[] = []
    const { timer } = fakeTimer()
    const session = createGameSession({ emit: e => events.push(e), timer })
    session.begin()

    session.submitMove(moveReview({ whiteEvalCp: 120 }))
    session.submitMove(moveReview({ whiteEvalCp: -120 }))
    expect(events.some(event => event.kind === 'momentum_swing')).toBe(false)
  })

  /**
   * @example
   * expect(events.at(-1)?.kind).toBe('game_start')
   */
  it('emits game_start again on restart', () => {
    const events: SemanticEvent[] = []
    const { timer } = fakeTimer()
    const session = createGameSession({ emit: e => events.push(e), timer })
    session.begin()
    events.length = 0

    session.restart()
    expect(events).toEqual([{ kind: 'game_start' }])
  })
})
