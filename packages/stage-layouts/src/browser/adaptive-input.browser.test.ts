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

  // Report: https://github.com/moeru-ai/airi/issues/3502
  // Root cause: Mobile keyboards resize the viewport; switching focus triggered onFocusIn,
  // which overwrote referenceLayoutHeight with the shrunken height and collapsed the stage.
  // Fix: Preserve referenceLayoutHeight while the keyboard is active or closing.
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
