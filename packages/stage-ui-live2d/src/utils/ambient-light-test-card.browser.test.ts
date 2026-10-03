import { describe, expect, it } from 'vitest'

import { ambientLightTestCard, drawAmbientLightTestCard } from './ambient-light-test-card'

/** Channel offsets inside the RGBA quadruple that `getImageData` returns. */
const redChannel = 0
const alphaChannel = 3

/**
 * Tolerance on a ramp end, in sRGB levels.
 *
 * The gradient is sampled at the center of the end pixel, which lies half a
 * pixel inside the ramp, so the end reads a fraction of one step short of the
 * declared value.
 */
const rampEndTolerance = 2

const { width, height, margin, ramp, bars, patches } = ambientLightTestCard
const card = drawAmbientLightTestCard()
const context = card.getContext('2d')!

// The card is a measuring instrument: the devtool captions describe it from
// these same numbers, and a reader compares the shader output against what the
// card is said to carry. These cases read the drawn pixels back, so the card
// and its description cannot drift apart.
describe('ambient light test card', () => {
  it('draws the card at its declared size', () => {
    expect(card.width).toBe(width)
    expect(card.height).toBe(height)
  })

  it('ramps the body from the declared low end to the declared high end', () => {
    const row = Math.round((ramp.top + ramp.bottom) / 2)
    const levels = channelRow(ramp.left, row, ramp.right - ramp.left, redChannel)
    const lowEnd = levels[0]
    const highEnd = levels[levels.length - 1]

    expect(lowEnd).toBeGreaterThanOrEqual(ramp.low - rampEndTolerance)
    expect(lowEnd).toBeLessThanOrEqual(ramp.low + rampEndTolerance)
    expect(highEnd).toBeGreaterThanOrEqual(ramp.high - rampEndTolerance)
    expect(highEnd).toBeLessThanOrEqual(ramp.high + rampEndTolerance)

    // Low at the left and high at the right, with no step back along the way.
    for (const [index, level] of levels.slice(1).entries())
      expect(level, `column ${index + 1}`).toBeGreaterThanOrEqual(levels[index])
  })

  it('draws one bar at each declared width', () => {
    const row = channelRow(0, bars.top + Math.round(bars.height / 2), width, alphaChannel)

    // The bars are the only opaque shapes in this row. The patches share it and
    // carry partial alpha, so they cannot be mistaken for a bar.
    expect(opaqueRunLengths(row)).toEqual([...bars.widths])
  })

  it('draws each patch at its declared alpha', () => {
    for (const patch of patches) {
      const center = pixelAt(patch.left + Math.round(patch.width / 2), patch.top + Math.round(patch.height / 2))
      expect(center[alphaChannel], `patch at ${patch.left}`).toBe(Math.round(patch.alpha * 255))
    }
  })

  it('keeps the declared margin transparent on all four sides', () => {
    expect(highestAlpha(0, 0, width, margin), 'top margin').toBe(0)
    expect(highestAlpha(0, height - margin, width, margin), 'bottom margin').toBe(0)
    expect(highestAlpha(0, 0, margin, height), 'left margin').toBe(0)
    expect(highestAlpha(width - margin, 0, margin, height), 'right margin').toBe(0)
  })
})

function pixelAt(x: number, y: number) {
  return context.getImageData(x, y, 1, 1).data
}

/** Reads one channel of a horizontal run of pixels, left to right. */
function channelRow(left: number, top: number, length: number, channel: number) {
  const { data } = context.getImageData(left, top, length, 1)
  return Array.from({ length }, (_, index) => data[index * 4 + channel])
}

function highestAlpha(left: number, top: number, regionWidth: number, regionHeight: number) {
  const { data } = context.getImageData(left, top, regionWidth, regionHeight)
  let highest = 0
  for (let index = alphaChannel; index < data.length; index += 4)
    highest = Math.max(highest, data[index])

  return highest
}

/** Lengths of the fully opaque runs in one row of alpha, left to right. */
function opaqueRunLengths(alpha: number[]) {
  const lengths: number[] = []
  let run = 0
  for (const value of alpha) {
    if (value === 255) {
      run += 1
      continue
    }

    if (run > 0)
      lengths.push(run)
    run = 0
  }

  if (run > 0)
    lengths.push(run)

  return lengths
}
