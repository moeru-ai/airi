// @vitest-environment jsdom

import type { Display, Rectangle } from 'electron'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue'

import ControlsIslandRoot from './controls-island-root.vue'

import { resolveControlsIslandDock, useControlsIslandPlacement } from './use-controls-island-placement'

const primaryDisplay = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 25, width: 1920, height: 1055 },
} as Display

const displays = shallowRef([primaryDisplay])
const windowBounds = {
  x: shallowRef(1370),
  y: shallowRef(430),
  width: shallowRef(450),
  height: shallowRef(600),
}
vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronAllDisplays: () => displays,
  useElectronWindowBounds: () => windowBounds,
}))

const mountedApps: Array<{ host: HTMLElement, unmount: () => void }> = []

function resolve(windowBounds: Rectangle) {
  return resolveControlsIslandDock({
    displays: [primaryDisplay],
    previousDock: 'bottom-right',
    windowBounds,
  })
}

function mountRoot() {
  const frozen = shallowRef(false)
  const ContextConsumer = defineComponent({
    setup() {
      const placement = useControlsIslandPlacement()

      return () => h('output', {
        'data-dock': placement.dock.value,
        'data-phase': placement.motionPhase.value,
      })
    },
  })
  const host = document.createElement('div')
  const app = createApp({
    setup() {
      return () => h(ControlsIslandRoot, { frozen: frozen.value }, {
        default: () => h(ContextConsumer),
      })
    },
  })

  document.body.appendChild(host)
  app.mount(host)
  mountedApps.push({
    host,
    unmount: () => app.unmount(),
  })

  return { frozen, host }
}

function readPlacement(host: HTMLElement) {
  const output = host.querySelector('[data-dock]')

  return {
    dock: output?.getAttribute('data-dock'),
    phase: output?.getAttribute('data-phase'),
  }
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn((query: string): MediaQueryList => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  })))
})

afterEach(() => {
  for (const mounted of mountedApps) {
    mounted.unmount()
    mounted.host.remove()
  }
  mountedApps.length = 0
  displays.value = [primaryDisplay]
  windowBounds.x.value = 1370
  windowBounds.y.value = 430
  windowBounds.width.value = 450
  windowBounds.height.value = 600
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('resolveControlsIslandDock', () => {
  it('places the island in the top-left screen quadrant', () => {
    expect(resolve({ x: 100, y: 100, width: 450, height: 600 })).toBe('top-left')
  })

  it('places the island in the top-right screen quadrant', () => {
    expect(resolve({ x: 1370, y: 100, width: 450, height: 600 })).toBe('top-right')
  })

  it('places the island in the bottom-left screen quadrant', () => {
    expect(resolve({ x: 100, y: 430, width: 450, height: 600 })).toBe('bottom-left')
  })

  it('places the island in the bottom-right screen quadrant', () => {
    expect(resolve({ x: 1370, y: 430, width: 450, height: 600 })).toBe('bottom-right')
  })

  it('uses the display that contains the largest window area', () => {
    const secondaryDisplay = {
      bounds: { x: -1600, y: -900, width: 1600, height: 900 },
      workArea: { x: -1600, y: -900, width: 1600, height: 860 },
    } as Display

    const dock = resolveControlsIslandDock({
      displays: [primaryDisplay, secondaryDisplay],
      previousDock: 'bottom-right',
      windowBounds: { x: -500, y: -300, width: 450, height: 600 },
    })

    expect(dock).toBe('bottom-right')
  })

  it('keeps the previous dock inside the display center dead zone', () => {
    const dock = resolveControlsIslandDock({
      displays: [primaryDisplay],
      previousDock: 'top-left',
      windowBounds: { x: 735, y: 253, width: 450, height: 600 },
    })

    expect(dock).toBe('top-left')
  })

  it('keeps the current dock until display data is available', () => {
    const dock = resolveControlsIslandDock({
      displays: [],
      previousDock: 'top-right',
      windowBounds: { x: 100, y: 100, width: 450, height: 600 },
    })

    expect(dock).toBe('top-right')
  })

  it('keeps the default dock until window bounds are available', () => {
    const dock = resolveControlsIslandDock({
      displays: [primaryDisplay],
      previousDock: 'bottom-right',
      windowBounds: { x: 0, y: 0, width: 0, height: 0 },
    })

    expect(dock).toBe('bottom-right')
  })
})

describe('controlsIslandRoot', () => {
  it('changes corners one second after the last window movement', async () => {
    vi.useFakeTimers()
    const { host } = mountRoot()

    expect(readPlacement(host)).toEqual({
      dock: 'bottom-right',
      phase: 'idle',
    })

    windowBounds.x.value = 100
    await nextTick()
    await vi.advanceTimersByTimeAsync(500)

    windowBounds.x.value = 120
    await nextTick()
    await vi.advanceTimersByTimeAsync(999)

    expect(readPlacement(host)).toEqual({
      dock: 'bottom-right',
      phase: 'idle',
    })

    await vi.advanceTimersByTimeAsync(1)

    expect(readPlacement(host).phase).toBe('leaving')

    await vi.advanceTimersByTimeAsync(149)

    expect(readPlacement(host)).toEqual({
      dock: 'bottom-right',
      phase: 'leaving',
    })

    await vi.advanceTimersByTimeAsync(1)

    expect(readPlacement(host)).toEqual({
      dock: 'bottom-left',
      phase: 'entering',
    })

    await vi.advanceTimersByTimeAsync(15)

    expect(readPlacement(host).phase).toBe('entering')

    await vi.advanceTimersByTimeAsync(1)

    expect(readPlacement(host).phase).toBe('arriving')

    await vi.advanceTimersByTimeAsync(149)

    expect(readPlacement(host).phase).toBe('arriving')

    await vi.advanceTimersByTimeAsync(1)

    expect(readPlacement(host).phase).toBe('idle')
  })

  it('waits for an active Island interaction to end before it moves', async () => {
    vi.useFakeTimers()
    const { frozen, host } = mountRoot()

    frozen.value = true
    windowBounds.x.value = 100
    await nextTick()
    await vi.advanceTimersByTimeAsync(1000)

    expect(readPlacement(host)).toEqual({
      dock: 'bottom-right',
      phase: 'idle',
    })

    frozen.value = false
    await nextTick()

    expect(readPlacement(host).phase).toBe('leaving')

    await vi.advanceTimersByTimeAsync(315)

    expect(readPlacement(host)).toEqual({
      dock: 'bottom-left',
      phase: 'arriving',
    })

    await vi.advanceTimersByTimeAsync(1)

    expect(readPlacement(host)).toEqual({
      dock: 'bottom-left',
      phase: 'idle',
    })
  })
})
