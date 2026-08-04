import { describe, expect, it } from 'vitest'

import { resolveFadeOnHoverInteraction } from './fade-on-hover'

describe('fade on hover interaction', () => {
  it('lets pointer input reach the underlying app when a visible model fades', () => {
    const interaction = resolveFadeOnHoverInteraction({
      cursorInsideWindow: true,
      enabled: true,
      transparentForFade: false,
      transparentForPointer: false,
    })

    expect(interaction.fadeStage).toBe(true)
    expect(interaction.ignoreMouseEvents).toBe(true)
  })

  it('keeps an unfaded transparent stage click-through', () => {
    const interaction = resolveFadeOnHoverInteraction({
      cursorInsideWindow: true,
      enabled: true,
      transparentForFade: true,
      transparentForPointer: true,
    })

    expect(interaction.fadeStage).toBe(false)
    expect(interaction.ignoreMouseEvents).toBe(true)
  })

  it('keeps the stage visible and interactive when Auto Hide is disabled', () => {
    const interaction = resolveFadeOnHoverInteraction({
      cursorInsideWindow: true,
      enabled: false,
      transparentForFade: false,
      transparentForPointer: false,
    })

    expect(interaction.fadeStage).toBe(false)
    expect(interaction.ignoreMouseEvents).toBe(false)
  })
})
