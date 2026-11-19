import { describe, expect, it } from 'vitest'

import { isControlsIslandConcealed } from './controls-island-visibility'

const atRest = { cursorAway: false, overlayOpen: false, pressed: false, focused: false }

describe('isControlsIslandConcealed', () => {
  it('hides the Island while the cursor is away and nothing holds it', () => {
    expect(isControlsIslandConcealed({ ...atRest, cursorAway: true })).toBe(true)
  })

  it('shows the Island while the cursor is in the stage window', () => {
    expect(isControlsIslandConcealed(atRest)).toBe(false)
  })

  it('keeps the Island while its menu or a dialog is open', () => {
    expect(isControlsIslandConcealed({ ...atRest, cursorAway: true, overlayOpen: true })).toBe(false)
  })

  it('keeps the Island while a press that started on it continues', () => {
    expect(isControlsIslandConcealed({ ...atRest, cursorAway: true, pressed: true })).toBe(false)
  })

  it('keeps the Island while it holds keyboard focus', () => {
    expect(isControlsIslandConcealed({ ...atRest, cursorAway: true, focused: true })).toBe(false)
  })
})
