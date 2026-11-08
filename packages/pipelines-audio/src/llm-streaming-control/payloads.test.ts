import { describe, expect, it } from 'vitest'

import { normalizeActPayload } from './payloads'

describe('normalizeActPayload', () => {
  it('normalizes object emotion and motion from ACT payloads', () => {
    expect(normalizeActPayload({
      emotion: { name: 'happy', intensity: 0.8 },
      motion: 'nod',
    })).toEqual({
      emotion: { name: 'happy', intensity: 0.8 },
      motion: 'nod',
    })
  })

  it('normalizes string emotion and trims motion cues', () => {
    expect(normalizeActPayload({
      emotion: 'surprised',
      motion: ' lean forward ',
    })).toEqual({
      emotion: { name: 'surprised', intensity: 1 },
      motion: 'lean forward',
    })
  })

  it('clamps emotion intensity into the supported range', () => {
    expect(normalizeActPayload({
      emotion: { name: 'happy', intensity: 2 },
    })).toEqual({
      emotion: { name: 'happy', intensity: 1 },
    })
  })

  it('normalizes timed and persistent Live2D expressions', () => {
    expect(normalizeActPayload({
      expression: ' 05_Angry ',
    })).toEqual({
      expression: { name: '05_Angry' },
    })

    expect(normalizeActPayload({
      expression: { name: ' 08_EyeCheerful ', duration: 3 },
    })).toEqual({
      expression: { name: '08_EyeCheerful', duration: 3 },
    })
  })

  it('normalizes a null expression as an explicit reset', () => {
    expect(normalizeActPayload({ expression: null })).toEqual({ expression: null })
  })
})
