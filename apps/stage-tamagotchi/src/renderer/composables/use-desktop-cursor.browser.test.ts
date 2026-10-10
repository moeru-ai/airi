import type { DesktopCapabilities, DesktopCompanionSnapshot } from '../../shared/desktop-companion'

import { createContext, defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { startLoopGetCursorScreenPoint } from '@proj-airi/electron-eventa'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'

import { defaultDesktopPreferences } from '../../shared/desktop-companion'
import { desktopCapabilitiesChanged, desktopCapabilitiesGet, desktopCompanionChanged, desktopCompanionGet, desktopCursorSample } from '../../shared/eventa/desktop-companion'
import { useDesktopCompanionStore } from '../stores/desktop-companion'
import { useDesktopCursor } from './use-desktop-cursor'

let context = createContext()
vi.mock('@proj-airi/electron-vueuse', () => ({
  getElectronEventaContext: () => context,
  useElectronEventaInvoke: (event: Parameters<typeof defineInvoke>[1]) => defineInvoke(context, event),
}))

const cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.splice(0).forEach(dispose => dispose())
})

function setup(global: boolean, initial?: Promise<DesktopCompanionSnapshot>) {
  context = createContext()
  const snapshot: DesktopCompanionSnapshot = { preferences: defaultDesktopPreferences(), notifications: [], unreadCount: 0, archivedUnreadCount: 0, nativeSupported: true, persistence: 'ready', revision: 0 }
  const capabilities: DesktopCapabilities = { backend: global ? 'x11' : 'wayland', detection: 'explicit', globalCursor: global ? 'available' : 'unsupported', windowPositioning: global ? 'available' : 'unsupported', cursorSource: global ? 'electron-screen' : 'window-local', nativeNotifications: true, displays: [], layoutRevision: 0 }
  const start = vi.fn()
  defineInvokeHandler(context, desktopCompanionGet, () => initial ?? snapshot)
  defineInvokeHandler(context, desktopCapabilitiesGet, () => capabilities)
  defineInvokeHandler(context, startLoopGetCursorScreenPoint, start)
  const pinia = createPinia()
  const element = document.createElement('div')
  document.body.appendChild(element)
  let cursor: ReturnType<typeof useDesktopCursor>
  let store: ReturnType<typeof useDesktopCompanionStore>
  const app = createApp({
    setup() {
      store = useDesktopCompanionStore()
      cursor = useDesktopCursor()
      return () => h('div', `${cursor.x.value},${cursor.y.value}`)
    },
  })
  app.use(pinia).mount(element)
  cleanups.push(() => {
    app.unmount()
    disposePinia(pinia)
    element.remove()
  })
  return { cursor: cursor!, store: store!, start, snapshot, capabilities }
}

describe('desktop cursor source and renderer snapshots', () => {
  it('uses only recent window pointer events on native Wayland', async () => {
    const { cursor, store, start } = setup(false)
    await expect.poll(() => store.ready).toBe(true)
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 123, clientY: 234 }))
    await nextTick()
    expect(cursor.x.value).toBe(123)
    expect(cursor.y.value).toBe(234)
    expect(cursor.hasFreshSample.value).toBe(true)
    expect(cursor.isOutsideWindow.value).toBe(false)
    expect(start).not.toHaveBeenCalled()
    document.documentElement.dispatchEvent(new PointerEvent('pointerleave'))
    await nextTick()
    expect(cursor.x.value).toBe(window.innerWidth / 2)
    expect(cursor.y.value).toBe(window.innerHeight / 2)
    expect(cursor.hasFreshSample.value).toBe(false)
    expect(cursor.isOutsideWindow.value).toBe(true)
    expect(cursor.isAroundWindowBorder.value).toBe(false)
  })

  it('expires local fallback coordinates after a lost leave event', async () => {
    const { cursor, store } = setup(false)
    await expect.poll(() => store.ready).toBe(true)
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 80, clientY: 100 }))
    expect(cursor.x.value).toBe(80)
    await expect.poll(() => cursor.x.value, { timeout: 3000 }).toBe(window.innerWidth / 2)
  })

  it('uses CSS-local global samples once and invalidates them after hotplug', async () => {
    const { cursor, store, start, capabilities } = setup(true)
    await expect.poll(() => store.ready).toBe(true)
    expect(start).toHaveBeenCalledTimes(1)
    await context.emit(desktopCursorSample, { screenDip: { x: -1700, y: -100 }, localCss: { x: 80, y: 80 }, displayId: 7, sampledAt: Date.now(), layoutRevision: 0 })
    expect(cursor.x.value).toBe(80)
    await context.emit(desktopCapabilitiesChanged, { ...capabilities, layoutRevision: 1 })
    expect(cursor.x.value).toBe(window.innerWidth / 2)
    await context.emit(desktopCursorSample, { screenDip: { x: -1700, y: -100 }, localCss: { x: 90, y: 90 }, displayId: 7, sampledAt: Date.now(), layoutRevision: 0 })
    expect(cursor.x.value).toBe(window.innerWidth / 2)
  })

  it('does not reuse a stalled global stream', async () => {
    const { cursor, store } = setup(true)
    await expect.poll(() => store.ready).toBe(true)
    await context.emit(desktopCursorSample, { screenDip: { x: 0, y: 0 }, localCss: { x: 80, y: 80 }, displayId: 7, sampledAt: Date.now() - 3000, layoutRevision: 0 })
    expect(cursor.x.value).toBe(window.innerWidth / 2)
  })

  it('does not overwrite a live preference change with an older hydration response', async () => {
    let resolveInitial: (snapshot: DesktopCompanionSnapshot) => void = () => {}
    const initial = new Promise<DesktopCompanionSnapshot>((resolve) => {
      resolveInitial = resolve
    })
    const { store, snapshot } = setup(false, initial)
    await context.emit(desktopCompanionChanged, { ...snapshot, preferences: { ...snapshot.preferences, pulsingBorder: false }, revision: 2 })
    resolveInitial(snapshot)
    await nextTick()
    expect(store.preferences.pulsingBorder).toBe(false)
    expect(store.snapshot.revision).toBe(2)
  })
})
