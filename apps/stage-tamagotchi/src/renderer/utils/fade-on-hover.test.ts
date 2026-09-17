import { describe, expect, it } from 'vitest'

import { resolveFadeOnHoverInteraction } from './fade-on-hover'

describe('fade on hover interaction', () => {
  it('lets pointer input reach the underlying app when a visible model fades', () => {
    const interaction = resolveFadeOnHoverInteraction({
      alwaysOnTop: true,
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
      alwaysOnTop: true,
      cursorInsideWindow: true,
      enabled: true,
      transparentForFade: true,
      transparentForPointer: true,
    })

    expect(interaction.fadeStage).toBe(false)
    expect(interaction.ignoreMouseEvents).toBe(true)
  })

  it('passes clicks through blank pixels of a pinned stage while Auto Hide is disabled', () => {
    const interaction = resolveFadeOnHoverInteraction({
      alwaysOnTop: true,
      cursorInsideWindow: true,
      enabled: false,
      transparentForFade: true,
      transparentForPointer: true,
    })

    expect(interaction.fadeStage).toBe(false)
    expect(interaction.ignoreMouseEvents).toBe(true)
  })

  it('keeps opaque model pixels clickable while Auto Hide is disabled', () => {
    const interaction = resolveFadeOnHoverInteraction({
      alwaysOnTop: true,
      cursorInsideWindow: true,
      enabled: false,
      transparentForFade: false,
      transparentForPointer: false,
    })

    expect(interaction.fadeStage).toBe(false)
    expect(interaction.ignoreMouseEvents).toBe(false)
  })

  it('holds clicks on an unpinned stage so it cannot sink behind the app below', () => {
    const interaction = resolveFadeOnHoverInteraction({
      alwaysOnTop: false,
      cursorInsideWindow: true,
      enabled: false,
      transparentForFade: true,
      transparentForPointer: true,
    })

    expect(interaction.ignoreMouseEvents).toBe(false)
  })
})
