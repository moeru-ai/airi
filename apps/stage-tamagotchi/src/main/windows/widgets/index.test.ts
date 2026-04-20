import type { WidgetWindowSize } from '../../../shared/eventa'

import { describe, expect, it } from 'vitest'

import { normalizeWidgetWindowSize } from '../../../shared/utils/electron/windows/window-size'

describe('normalizeWidgetWindowSize', () => {
  it('returns undefined for missing or unusable base sizes', () => {
    expect(normalizeWidgetWindowSize()).toBeUndefined()
    expect(normalizeWidgetWindowSize({ width: 0, height: 320 })).toBeUndefined()
    expect(normalizeWidgetWindowSize({ width: 320, height: -1 })).toBeUndefined()
    expect(normalizeWidgetWindowSize({ width: Number.NaN, height: 320 })).toBeUndefined()
    expect(normalizeWidgetWindowSize({ width: 320, height: Number.POSITIVE_INFINITY })).toBeUndefined()
  })

  it('floors valid dimensions and strips invalid optional constraints', () => {
    const input: WidgetWindowSize = {
      width: 620.9,
      height: 480.4,
      minWidth: -10,
      minHeight: Number.NaN,
      maxWidth: 1280.6,
      maxHeight: 720.1,
    }

    expect(normalizeWidgetWindowSize(input)).toEqual({
      width: 620,
      height: 480,
      maxWidth: 1280,
      maxHeight: 720,
    })
  })

  it('keeps contradictory but numerically valid constraints for later display clamping', () => {
    const input: WidgetWindowSize = {
      width: 900,
      height: 700,
      minWidth: 1200,
      maxWidth: 800,
      minHeight: 900,
      maxHeight: 600,
    }

    expect(normalizeWidgetWindowSize(input)).toEqual({
      width: 900,
      height: 700,
      minWidth: 1200,
      maxWidth: 800,
      minHeight: 900,
      maxHeight: 600,
    })
  })
})
