import { describe, expect, it } from 'vitest'

import * as v from 'valibot'

import { motionCommandSchema, motionCorrelationSchema } from './command'

describe('motion command boundary', () => {
  const correlation = { modelId: 'avatar', requestId: 'request' }

  it('accepts play and stop commands', () => {
    expect(v.safeParse(motionCommandSchema, { ...correlation, type: 'play', motionId: 'bow', options: { mode: 'queue', speed: 1 } }).success).toBe(true)
    expect(v.safeParse(motionCommandSchema, { ...correlation, type: 'stop' }).success).toBe(true)
  })

  it('rejects malformed options, unknown types, and non-finite numbers', () => {
    for (const options of [null, undefined, { mode: 'anything' }, { speed: Number.NaN }, { duration: Number.POSITIVE_INFINITY }])
      expect(v.safeParse(motionCommandSchema, { ...correlation, type: 'play', motionId: 'bow', options }).success).toBe(false)
    expect(v.safeParse(motionCommandSchema, { ...correlation, type: 'register' }).success).toBe(false)
  })

  it('retains safe correlation for rejected requests without accepting arbitrary payloads', () => {
    expect(v.parse(motionCorrelationSchema, { ...correlation, type: 'unknown' })).toEqual(correlation)
    expect(v.safeParse(motionCorrelationSchema, { modelId: 'avatar', requestId: '' }).success).toBe(false)
  })
})
