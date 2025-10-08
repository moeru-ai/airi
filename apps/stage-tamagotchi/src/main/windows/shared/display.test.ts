import type { Rectangle } from 'electron'

import { describe, expect, it } from 'vitest'

import { heightFrom, mapForBreakpoints, widthFrom } from './display'

describe('mapForBreakpoints', () => {
  it('should return the correct size based on breakpoints', () => {
    const val = mapForBreakpoints(800, { sm: 100, md: 200, lg: 300 })
    expect(val).toBe(200)
  })

  it('it should fallback to nearest smaller breakpoint', () => {
    const val = mapForBreakpoints(1024, { sm: 100, md: 200 }) // expected to be lg
    expect(val).toBe(200)
  })

  it('it should return the largest supplied size if bounds exceed all breakpoints', () => {
    const val1 = mapForBreakpoints(2000, { sm: 100, md: 200 }) // expected to be lg
    expect(val1).toBe(200)

    const val2 = mapForBreakpoints(2000, { 'sm': 100, 'md': 200, '2xl': 500 }) // expected to be lg
    expect(val2).toBe(500)
  })
})

describe('widthFrom', () => {
  it('should return width based on percentage', () => {
    expect(widthFrom({ width: 1000 } as Rectangle, { percentage: 0.5 })).toBe(500)
  })

  it('should return width based on fixed value', () => {
    expect(widthFrom({ width: 1000 } as Rectangle, 300)).toBe(300)
  })

  it('should respect min constraint', () => {
    expect(widthFrom({ width: 1000 } as Rectangle, { percentage: 0.1, min: 200 })).toBe(200)
    expect(widthFrom({ width: 1000 } as Rectangle, { actual: 150, min: 200 })).toBe(200)
    expect(widthFrom({ width: 1000 } as Rectangle, { actual: 250, min: 200 })).toBe(250)
  })

  it('should respect max constraint', () => {
    expect(widthFrom({ width: 1000 } as Rectangle, { percentage: 0.5, max: 400 })).toBe(400)
    expect(widthFrom({ width: 1000 } as Rectangle, { actual: 450, max: 400 })).toBe(400)
    expect(widthFrom({ width: 1000 } as Rectangle, { actual: 350, max: 400 })).toBe(350)
  })
})

describe('heightFrom', () => {
  it('should return height based on percentage', () => {
    expect(heightFrom({ height: 1000 } as Rectangle, { percentage: 0.5 })).toBe(500)
  })

  it('should return height based on fixed value', () => {
    expect(heightFrom({ height: 1000 } as Rectangle, 300)).toBe(300)
  })

  it('should respect min constraint', () => {
    expect(heightFrom({ height: 1000 } as Rectangle, { percentage: 0.1, min: 200 })).toBe(200)
    expect(heightFrom({ height: 1000 } as Rectangle, { actual: 150, min: 200 })).toBe(200)
    expect(heightFrom({ height: 1000 } as Rectangle, { actual: 250, min: 200 })).toBe(250)
  })

  it('should respect max constraint', () => {
    expect(heightFrom({ height: 1000 } as Rectangle, { percentage: 0.5, max: 400 })).toBe(400)
    expect(heightFrom({ height: 1000 } as Rectangle, { actual: 450, max: 400 })).toBe(400)
    expect(heightFrom({ height: 1000 } as Rectangle, { actual: 350, max: 400 })).toBe(350)
  })
})
