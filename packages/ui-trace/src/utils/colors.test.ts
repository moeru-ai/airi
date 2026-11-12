import { describe, expect, it } from 'vitest'

import { themedColor } from './colors'

describe('themedColor', () => {
  it('gives a colored track a chromatic shade for each theme', () => {
    const light = themedColor('#3b82f6', false)
    const dark = themedColor('#3b82f6', true)
    expect(light).toMatch(/^#[0-9a-f]{6}$/)
    expect(dark).toMatch(/^#[0-9a-f]{6}$/)
    // The dark shade is lighter, so it reads on a dark background.
    expect(dark).not.toBe(light)
  })

  it('keeps a gray color and an unknown color as they are', () => {
    expect(themedColor('#64748b', false)).toBe('#64748b')
    expect(themedColor('not a color', true)).toBe('not a color')
  })

  it('reads hsl colors, such as the colors of tracks without a definition', () => {
    expect(themedColor('hsl(295 60% 55%)', false)).toMatch(/^#[0-9a-f]{6}$/)
  })
})
