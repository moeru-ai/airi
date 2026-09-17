import { describe, expect, it } from 'vitest'

import { resolveFadeOnHoverInteraction } from './fade-on-hover'

describe('fade on hover interaction', () => {
  it('lets pointer input reach the underlying app when a visible model fades', () => {
    const interaction = resolveFadeOnHoverInteraction({
      alwaysOnTop: true,
      cursorInsideWindow: true,
      enabled: true,
      stageHasOpaqueBackground: false,
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
      stageHasOpaqueBackground: false,
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
      stageHasOpaqueBackground: false,
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
      stageHasOpaqueBackground: false,
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
      stageHasOpaqueBackground: false,
      transparentForFade: true,
      transparentForPointer: true,
    })

    expect(interaction.ignoreMouseEvents).toBe(false)
  })
  // A scene fills the window behind the model, so the stage is opaque everywhere even
  // where the canvas is not.
  it('holds every click while a scene backs the stage', () => {
    const interaction = resolveFadeOnHoverInteraction({
      alwaysOnTop: true,
      cursorInsideWindow: true,
      enabled: false,
      stageHasOpaqueBackground: true,
      transparentForFade: true,
      transparentForPointer: true,
    })

    expect(interaction.ignoreMouseEvents).toBe(false)
  })

  // Fading hides the scene along with the model, so the window really is see-through
  // and a scene must not hold the click.
  it('passes clicks through a faded stage even when a scene backs it', () => {
    const interaction = resolveFadeOnHoverInteraction({
      alwaysOnTop: true,
      cursorInsideWindow: true,
      enabled: true,
      stageHasOpaqueBackground: true,
      transparentForFade: false,
      transparentForPointer: false,
    })

    expect(interaction.fadeStage).toBe(true)
    expect(interaction.ignoreMouseEvents).toBe(true)
  })
})
