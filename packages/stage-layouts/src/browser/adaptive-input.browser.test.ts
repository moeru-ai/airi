import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AdaptiveInput } from './adaptive-input'

describe('adaptive input browser mode', () => {
  let area: HTMLDivElement
  let viewport: HTMLDivElement
  let input1: HTMLInputElement
  let input2: HTMLInputElement

  beforeEach(() => {
    viewport = document.createElement('div')
    area = document.createElement('div')
    input1 = document.createElement('input')
    input2 = document.createElement('input')
    area.append(input1, input2)
    viewport.append(area)
    document.body.append(viewport)
  })

  afterEach(() => {
    viewport.remove()
  })

  // https://github.com/moeru-ai/airi/issues/3502
  // ROOT CAUSE:
  //
  // On Safari and Android Chrome where the software keyboard resizes the viewport,
  // switching focus between text inputs while the keyboard was open triggered onFocusIn.
  // onFocusIn previously overwrote referenceLayoutHeight with the shrunken layout viewport,
  // permanently collapsing the mobile stage surface until the next blur.
  //
  // We fixed this by preserving the idle referenceLayoutHeight when focus changes between inputs
  // while the keyboard is already active or closing.
  it('preserves stableViewportHeight when focus switches between text entries (Issue #3502)', async () => {
    const adaptiveInput = new AdaptiveInput({ area, viewport, window })
    await new Promise(resolve => requestAnimationFrame(resolve))

    const idleHeight = adaptiveInput.layout.stableViewportHeight
    expect(idleHeight).toBeGreaterThan(0)

    input1.focus()
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(adaptiveInput.layout.stableViewportHeight).toBe(idleHeight)

    input2.focus()
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(adaptiveInput.layout.stableViewportHeight).toBe(idleHeight)

    adaptiveInput.dispose()
  })
})
