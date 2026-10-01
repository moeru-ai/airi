import type { Stimulus } from './intake'

import { describe, expect, it } from 'vitest'

import { decideByPrior, IntakeLog, salienceFromUrgency } from './intake'

const stimulus: Stimulus = {
  id: 'stimulus',
  kind: 'reminder',
  origin: 'internal',
  source: 'scheduler',
  event: 'task:due',
  bindings: [],
  salience: 0.7,
  receivedAt: 1,
}

describe('intake', () => {
  it('maps source urgency words to a prior salience', () => {
    expect(salienceFromUrgency('immediate')).toBe(0.9)
    expect(salienceFromUrgency('critical')).toBe(0.9)
    expect(salienceFromUrgency('soon')).toBe(0.7)
    expect(salienceFromUrgency('high')).toBe(0.7)
    expect(salienceFromUrgency('later')).toBe(0.3)
    expect(salienceFromUrgency('low')).toBe(0.3)
    expect(salienceFromUrgency(undefined)).toBe(0.5)
    expect(salienceFromUrgency('whenever')).toBe(0.5)
  })

  it('keeps a bounded trace with one record per decision', () => {
    const log = new IntakeLog({ limit: 2, now: () => 5 })

    log.record(stimulus, { outcome: 'deferred', reason: 'busy', decidedBy: 'rule', retryAt: 10 })
    log.record(stimulus, { outcome: 'admitted', reason: 'due', decidedBy: 'rule', runId: 'run' })
    log.record({ ...stimulus, id: 'other' }, { outcome: 'ignored', reason: 'stale', decidedBy: 'rule' })

    expect(log.snapshot().map(record => record.outcome)).toEqual(['admitted', 'ignored'])
    expect(log.forStimulus('stimulus')).toMatchObject([{ outcome: 'admitted', runId: 'run', salience: 0.7, decidedAt: 5, origin: 'internal' }])
  })
})

describe('prior decisions', () => {
  const at = (salience: number, extra: Partial<Stimulus> = {}): Stimulus => ({ ...stimulus, salience, ...extra })

  it('admits immediate work at once and defers lower salience by its delay', () => {
    expect(decideByPrior(at(0.9), { now: 100, busy: false })).toMatchObject({ outcome: 'admitted', decidedBy: 'rule' })
    expect(decideByPrior(at(0.7), { now: 100, busy: false })).toMatchObject({ outcome: 'deferred', retryAt: 10_100 })
    expect(decideByPrior(at(0.5), { now: 100, busy: false })).toMatchObject({ outcome: 'deferred', retryAt: 30_100 })
    expect(decideByPrior(at(0.3), { now: 100, busy: false })).toMatchObject({ outcome: 'deferred', retryAt: 60_100 })
  })

  it('defers work whose resource is busy and admits returning work when it is free', () => {
    expect(decideByPrior(at(0.9), { now: 100, busy: true })).toMatchObject({ outcome: 'deferred', reason: 'resource-busy', retryAt: 100 })
    expect(decideByPrior(at(0.3), { now: 500, busy: false, retryAt: 400 })).toMatchObject({ outcome: 'admitted' })
  })

  it('ignores work past its deadline instead of running it late', () => {
    expect(decideByPrior(at(0.9, { deadlineAt: 100 }), { now: 100, busy: false })).toMatchObject({ outcome: 'ignored', reason: 'expired' })
  })
})
