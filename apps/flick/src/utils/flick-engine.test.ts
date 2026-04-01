import { describe, expect, it } from 'vitest'

import { buildDecisionDraft, evaluateDecision, slotToCardIndex, slotToOptionId } from './flick-engine'

describe('probability spinner engine', () => {
  it('blocks high-stakes questions', () => {
    const draft = buildDecisionDraft('Should I invest my emergency savings into crypto this week?', 'en')

    expect(draft.risk_flag).toBe('high_stakes_blocked')
    expect(draft.direction_cards).toHaveLength(0)
    expect(draft.blocked_title).toBeTruthy()
  })

  it('blocks insufficient context questions', () => {
    const draft = buildDecisionDraft('xxx', 'en')

    expect(draft.risk_flag).toBe('insufficient_context')
    expect(draft.direction_cards).toHaveLength(0)
  })

  it('builds 3 direction cards for a normal question', () => {
    const draft = buildDecisionDraft('这周要不要买那台二手相机？', 'zh')

    expect(draft.risk_flag).toBe('none')
    expect(draft.intent).toBe('spend')
    expect(draft.direction_cards).toHaveLength(3)
  })

  it('direction cards have correct slot assignments', () => {
    const draft = buildDecisionDraft('Should I text them tonight?', 'en')

    expect(draft.direction_cards[0].slot).toBe('A')
    expect(draft.direction_cards[1].slot).toBe('B')
    expect(draft.direction_cards[2].slot).toBe('C')
  })

  it('evaluateDecision returns a recommended card', () => {
    const draft = buildDecisionDraft('Should I text them tonight?', 'en')
    const result = evaluateDecision(draft)

    expect(result.risk_flag).toBe('none')
    expect(result.recommended_card).toBeTruthy()
    expect(result.direction_cards).toHaveLength(3)
  })

  it('normalizeWeights sums to approximately 1', () => {
    const draft = buildDecisionDraft('Should I text them tonight?', 'en')
    const result = evaluateDecision(draft)
    const total = result.direction_cards.reduce((sum, card) => sum + card.confidence, 0)

    expect(total).toBeCloseTo(1, 3)
  })

  it('slotToOptionId maps correctly', () => {
    expect(slotToOptionId('A')).toBe('do')
    expect(slotToOptionId('B')).toBe('delay')
    expect(slotToOptionId('C')).toBe('skip')
  })

  it('slotToCardIndex maps correctly', () => {
    expect(slotToCardIndex('A')).toBe(0)
    expect(slotToCardIndex('B')).toBe(1)
    expect(slotToCardIndex('C')).toBe(2)
  })

  it('intent is inferred correctly for spend', () => {
    const draft = buildDecisionDraft('Should I buy the camera this week?', 'en')
    expect(draft.intent).toBe('spend')
  })

  it('intent is inferred correctly for social', () => {
    const draft = buildDecisionDraft('Should I text them tonight?', 'en')
    expect(draft.intent).toBe('social')
  })

  it('intent is inferred correctly for work', () => {
    const draft = buildDecisionDraft('Should I ship the landing page this weekend?', 'en')
    expect(draft.intent).toBe('work')
  })

  it('falls back to self intent when no pattern matches', () => {
    const draft = buildDecisionDraft('Should I just relax this afternoon?', 'en')
    expect(draft.intent).toBe('self')
  })

  it('self intent generates valid direction cards', () => {
    const draft = buildDecisionDraft('Should I just relax this afternoon?', 'en')
    expect(draft.intent).toBe('self')
    expect(draft.risk_flag).toBe('none')
    expect(draft.direction_cards).toHaveLength(3)
  })
})
