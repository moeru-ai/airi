import { DialogContent, DialogPortal, DialogRoot, TooltipContent, TooltipPortal, TooltipProvider, TooltipRoot, TooltipTrigger } from 'reka-ui'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'

import { stageOpaqueAttribute, useStagePaintedMask } from './use-stage-painted-mask'

/**
 * The stage window is 400 x 400 CSS pixels and the sample grid is 40 x 40, so
 * one grid cell is 10 x 10 window pixels. An element at window pixel (100, 100)
 * with size 100 x 100 covers grid cells 10 to 19 on both axes.
 */
const windowSize = { width: 400, height: 400 }
const sampleGrid = { width: 40, height: 40 }
const wholeWindow = { x: 0, y: 0, width: 1, height: 1 }

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
})

function mount(component: ReturnType<typeof defineComponent>) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(component)
  app.mount(host)
  cleanups.push(() => {
    app.unmount()
    host.remove()
  })
}

/** A blank stage canvas: nothing painted, so only overlays can mark the grid. */
function blankStage() {
  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 400
  return canvas
}

function readMask() {
  const stageCanvas = blankStage()
  const mask = useStagePaintedMask({
    stageCanvas: () => stageCanvas,
    sampleGrid: () => sampleGrid,
    windowSize: () => windowSize,
  })
  return mask.maskFor(wholeWindow, performance.now())!.alpha
}

function cellAt(alpha: Uint8ClampedArray, column: number, row: number) {
  return alpha[row * sampleGrid.width + column]
}

describe('stage painted mask overlays', () => {
  it('covers an element that carries the opaque marker', () => {
    mount(defineComponent(() => () => h('div', {
      [stageOpaqueAttribute]: true,
      style: 'position: fixed; left: 100px; top: 100px; width: 100px; height: 100px',
    })))

    const alpha = readMask()

    expect(cellAt(alpha, 15, 15)).toBe(255)
    expect(cellAt(alpha, 5, 5)).toBe(0)
  })

  it('covers a tooltip that reka-ui portals onto the body', async () => {
    // ROOT CAUSE:
    //
    // The mask covered only marked elements. Reka-ui portals tooltip, popover
    // and menu content to the body, outside every marked root, so an open
    // tooltip fed AIRI's own colors into the light maps. The mask now covers
    // reka-ui's popper wrapper, which this case pins to the installed version.
    mount(defineComponent(() => () => h(TooltipProvider, { delayDuration: 0 }, () => h(TooltipRoot, { defaultOpen: true }, () => [
      h(TooltipTrigger, { style: 'position: fixed; left: 100px; top: 100px; width: 20px; height: 20px' }, () => 'trigger'),
      h(TooltipPortal, () => h(TooltipContent, { side: 'bottom', sideOffset: 0, style: 'width: 100px; height: 60px' }, () => 'tip')),
    ]))))
    await nextTick()
    await new Promise(resolve => requestAnimationFrame(resolve))

    const content = document.querySelector('[data-reka-popper-content-wrapper]')
    expect(content).not.toBeNull()
    const bounds = content!.getBoundingClientRect()
    expect(bounds.width).toBeGreaterThan(0)

    const alpha = readMask()
    const column = Math.floor((bounds.left + bounds.width / 2) / 10)
    const row = Math.floor((bounds.top + bounds.height / 2) / 10)
    expect(cellAt(alpha, column, row)).toBe(255)
  })

  it('covers a dialog that reka-ui portals onto the body', async () => {
    mount(defineComponent(() => () => h(DialogRoot, { defaultOpen: true }, () => h(DialogPortal, () => h(DialogContent, {
      style: 'position: fixed; left: 200px; top: 200px; width: 100px; height: 100px',
    }, () => 'dialog')))))
    await nextTick()

    const alpha = readMask()

    expect(cellAt(alpha, 25, 25)).toBe(255)
    expect(cellAt(alpha, 5, 5)).toBe(0)
  })
})
