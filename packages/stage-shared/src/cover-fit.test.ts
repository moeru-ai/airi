import { describe, expect, it } from 'vitest'

import { coverRect } from './cover-fit'

describe('coverRect', () => {
  it('fills a wider box by trimming the top and bottom', () => {
    expect(coverRect({ width: 400, height: 300 }, { width: 1000, height: 1000 }))
      .toEqual({ x: 0, y: -50, width: 400, height: 400 })
  })

  it('fills a taller box by trimming the sides', () => {
    expect(coverRect({ width: 300, height: 400 }, { width: 1000, height: 1000 }))
      .toEqual({ x: -50, y: 0, width: 400, height: 400 })
  })

  it('leaves a matching aspect untrimmed', () => {
    expect(coverRect({ width: 400, height: 200 }, { width: 800, height: 400 }))
      .toEqual({ x: 0, y: 0, width: 400, height: 200 })
  })

  // Content with no size cannot be scaled, and a box left uncovered would read as a
  // hole in the surface.
  it('falls back to the box when the content has no size', () => {
    expect(coverRect({ width: 400, height: 300 }, { width: 0, height: 0 }))
      .toEqual({ x: 0, y: 0, width: 400, height: 300 })
  })
})
