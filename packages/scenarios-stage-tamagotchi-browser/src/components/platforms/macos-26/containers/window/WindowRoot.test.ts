// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, readonly, ref } from 'vue'

import WindowRoot from './WindowRoot.vue'

import { injectPlatformLayout } from '../../constants'

function createRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top,
  } as DOMRect
}

describe('windowRoot', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('re-anchors to workarea when dock is registered after mount', async () => {
    vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const host = document.createElement('div')
    document.body.appendChild(host)

    const platformRef = ref<HTMLElement | null>(null)
    const dockRef = ref<HTMLElement | null>(null)
    const uiScaleRef = ref(1)

    const app = createApp({
      setup() {
        return () => h('div', { ref: platformRef }, [
          h(WindowRoot, {
            anchorBounds: 'workarea',
            anchorTo: 'bottom-right',
            frame: false,
            hasShadow: false,
            style: {
              bottom: '0px',
              right: '0px',
            },
          }, () => h('div')),
        ])
      },
      provide: {
        [injectPlatformLayout as symbol]: {
          dock: dockRef,
          root: readonly(platformRef),
          uiScale: readonly(uiScaleRef),
        },
      },
    })

    app.mount(host)
    await nextTick()

    const platformEl = platformRef.value
    const windowEl = host.querySelector<HTMLElement>('.absolute.flex.flex-col.rounded-2xl.overflow-hidden')

    expect(platformEl).not.toBeNull()
    expect(windowEl).not.toBeNull()

    vi.spyOn(platformEl!, 'getBoundingClientRect').mockReturnValue(createRect(0, 0, 1000, 600))
    vi.spyOn(windowEl!, 'getBoundingClientRect').mockReturnValue(createRect(900, 500, 100, 100))

    const dockEl = document.createElement('div')
    vi.spyOn(dockEl, 'getBoundingClientRect').mockReturnValue(createRect(920, 200, 70, 200))
    dockRef.value = dockEl

    await nextTick()
    await nextTick()

    expect(windowEl!.style.right).toBe('80px')

    app.unmount()
    host.remove()
  })

  it('uses measured workarea bounds when uiScale is applied so dock does not overlap anchored window', async () => {
    vi.stubGlobal('requestAnimationFrame', ((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    }) as typeof requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', (() => {}) as typeof cancelAnimationFrame)

    const host = document.createElement('div')
    document.body.appendChild(host)

    const platformRef = ref<HTMLElement | null>(null)
    const dockRef = ref<HTMLElement | null>(null)
    const uiScaleRef = ref(1.25)

    const app = createApp({
      setup() {
        return () => h('div', { ref: platformRef }, [
          h(WindowRoot, {
            anchorBounds: 'workarea',
            anchorTo: 'bottom-right',
            frame: false,
            hasShadow: false,
            style: {
              bottom: '0px',
              right: '0px',
            },
          }, () => h('div')),
        ])
      },
      provide: {
        [injectPlatformLayout as symbol]: {
          dock: dockRef,
          root: readonly(platformRef),
          uiScale: readonly(uiScaleRef),
        },
      },
    })

    app.mount(host)
    await nextTick()

    const platformEl = platformRef.value
    const windowEl = host.querySelector<HTMLElement>('.absolute.flex.flex-col.rounded-2xl.overflow-hidden')

    expect(platformEl).not.toBeNull()
    expect(windowEl).not.toBeNull()

    vi.spyOn(platformEl!, 'getBoundingClientRect').mockReturnValue(createRect(0, 0, 1646, 926))
    vi.spyOn(windowEl!, 'getBoundingClientRect').mockReturnValue(createRect(1239, 383, 407, 543))

    const dockEl = document.createElement('div')
    vi.spyOn(dockEl, 'getBoundingClientRect').mockReturnValue(createRect(1571, 323, 66, 280))
    dockRef.value = dockEl

    await nextTick()
    await nextTick()

    expect(windowEl!.style.right).toBe('75px')

    app.unmount()
    host.remove()
  })
})
