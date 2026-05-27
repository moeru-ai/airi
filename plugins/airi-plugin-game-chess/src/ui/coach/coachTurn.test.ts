import type { SemanticEvent } from '../game/gameEvents'

import { describe, expect, it } from 'vitest'

import { MoveClassification } from '../../schema'
import { coachTurnFor } from './coachTurn'

/** Builds a `move` event with the given classification. */
function moveEvent(classification: MoveClassification): SemanticEvent {
  return { kind: 'move', classification, cpLoss: 0, moveUci: 'e2e4', mover: 'white' }
}

/**
 * @example
 * coachTurnFor({ kind: 'game_start' }) // a GameletAiTurnRequest
 */
describe('coachTurnFor', () => {
  /**
   * @example
   * expect(coachTurnFor({ kind: 'session_greeting' })?.instruction).toContain('Greet')
   */
  it('builds a request for the dialogue events', () => {
    const greeting = coachTurnFor({ kind: 'session_greeting' })
    expect(greeting?.instruction).toContain('Greet')
    expect(greeting?.headline).toContain('Chess')
    expect(greeting?.fallbackText.length).toBeGreaterThan(0)

    expect(coachTurnFor({ kind: 'game_start' })?.instruction).toContain('new chess game')
    expect(coachTurnFor({ kind: 'user_idle' })?.instruction).toContain('nudge')
  })

  /**
   * @example
   * expect(coachTurnFor({ kind: 'game_start' })?.systemInstructions.length).toBeGreaterThan(0)
   */
  it('attaches the standing teaching protocol to every request', () => {
    const request = coachTurnFor({ kind: 'game_start' })
    expect(request?.systemInstructions.length).toBeGreaterThan(0)
    // The protocol must carry the ACT emotion-token instruction.
    expect(request?.systemInstructions.some(line => line.includes('<|ACT:'))).toBe(true)
  })

  /**
   * @example
   * expect(coachTurnFor(moveEvent(MoveClassification.Blunder))).not.toBeNull()
   */
  it('comments on standout and error moves', () => {
    expect(coachTurnFor(moveEvent(MoveClassification.Brilliant))).not.toBeNull()
    expect(coachTurnFor(moveEvent(MoveClassification.Great))).not.toBeNull()
    expect(coachTurnFor(moveEvent(MoveClassification.Miss))).not.toBeNull()
    expect(coachTurnFor(moveEvent(MoveClassification.Mistake))).not.toBeNull()
    expect(coachTurnFor(moveEvent(MoveClassification.Blunder))).not.toBeNull()
  })

  /**
   * @example
   * expect(coachTurnFor(moveEvent(MoveClassification.Good))).toBeNull()
   */
  it('stays silent on routine moves to avoid over-talking', () => {
    expect(coachTurnFor(moveEvent(MoveClassification.Best))).toBeNull()
    expect(coachTurnFor(moveEvent(MoveClassification.Excellent))).toBeNull()
    expect(coachTurnFor(moveEvent(MoveClassification.Good))).toBeNull()
    expect(coachTurnFor(moveEvent(MoveClassification.Book))).toBeNull()
    expect(coachTurnFor(moveEvent(MoveClassification.Inaccuracy))).toBeNull()
  })

  /**
   * @example
   * expect(coachTurnFor(blunder)?.instruction).toContain('g1f3')
   */
  it('includes the move, rating and centipawn loss in a move instruction', () => {
    const request = coachTurnFor({
      kind: 'move',
      classification: MoveClassification.Blunder,
      cpLoss: 320,
      moveUci: 'g1f3',
      mover: 'black',
    })
    expect(request?.instruction).toContain('Black')
    expect(request?.instruction).toContain('g1f3')
    expect(request?.instruction).toContain('blunder')
    expect(request?.instruction).toContain('320')
    expect(request?.headline).toBe('Chess — blunder')
  })

  /**
   * @example
   * expect(coachTurnFor({ kind: 'in_check' })).toBeNull()
   */
  it('stays silent on a plain check', () => {
    expect(coachTurnFor({ kind: 'in_check' })).toBeNull()
  })

  /**
   * @example
   * expect(coachTurnFor(mateEnd)).toBeNull()
   */
  it('comments on checkmate but suppresses the redundant game_end after a mate', () => {
    expect(coachTurnFor({ kind: 'checkmate', winner: 'white' })?.instruction).toContain('Checkmate')
    expect(coachTurnFor({ kind: 'game_end', result: 'checkmate', winner: 'white' })).toBeNull()
    expect(coachTurnFor({ kind: 'game_end', result: 'draw', winner: null })?.instruction).toContain('draw')
  })

  /**
   * @example
   * expect(coachTurnFor(swing)?.instruction).toContain('momentum')
   */
  it('flags a momentum swing with both evaluations', () => {
    const request = coachTurnFor({ kind: 'momentum_swing', fromCp: 300, toCp: -300 })
    expect(request?.instruction).toContain('momentum')
    expect(request?.instruction).toContain('300')
    expect(request?.instruction).toContain('-300')
  })
})
