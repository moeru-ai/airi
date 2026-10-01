import type { Stimulus } from './intake'

import { describe, expect, it } from 'vitest'

import { IntakeLog, salienceFromUrgency } from './intake'

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
