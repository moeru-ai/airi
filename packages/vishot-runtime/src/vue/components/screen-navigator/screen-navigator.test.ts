// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import ScreenNavigator from './screen-navigator.vue'

const originalElementScrollIntoView = Element.prototype.scrollIntoView
const originalObjectScrollIntoView = (Object.prototype as { scrollIntoView?: unknown }).scrollIntoView

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })

  Object.defineProperty(Object.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})

afterAll(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: originalElementScrollIntoView,
  })

  if (originalObjectScrollIntoView === undefined) {
    // Keep Object prototype clean when this shim didn't exist before the test run.
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (Object.prototype as { scrollIntoView?: unknown }).scrollIntoView
  }
  else {
    Object.defineProperty(Object.prototype, 'scrollIntoView', {
      configurable: true,
      value: originalObjectScrollIntoView,
    })
  }
})

const scenes = [
  { id: 'intro-chat', title: 'Intro Chat' },
  { id: 'intro-websocket', title: 'Intro WebSocket' },
]

async function mountSceneNavigator(onNavigate = vi.fn()) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/intro-chat', component: { template: '<div />' } },
      { path: '/intro-websocket', component: { template: '<div />' } },
    ],
  })

  await router.push('/intro-chat')
  await router.isReady()

  const app = createApp({
    render: () => h(ScreenNavigator, {
      currentSceneId: ref('intro-chat'),
      onNavigate,
      scenes,
    }),
  })
  app.use(router)

  app.mount(host)

  return {
    app,
    host,
  }
}

describe('scene-navigator', () => {
  it('renders only compact prev/jump/next controls by default', async () => {
    const { app, host } = await mountSceneNavigator()

    expect(host.querySelector('[data-scene-nav-prev]')).not.toBeNull()
    expect(host.querySelector('[data-scene-nav-jump]')).not.toBeNull()
    expect(host.querySelector('[data-scene-nav-next]')).not.toBeNull()
    expect(host.querySelector('[data-scene-nav-panel]')).toBeNull()
    expect(host.textContent).not.toContain('Current scene')

    app.unmount()
    host.remove()
  })

  it('opens palette from jump button and selects a scene', async () => {
    const onNavigate = vi.fn()
    const { app, host } = await mountSceneNavigator(onNavigate)

    host.querySelector<HTMLElement>('[data-scene-nav-jump]')?.click()
    await nextTick()

    expect(document.querySelector('[data-scene-nav-palette][data-state="open"]')).not.toBeNull()

    document.querySelector<HTMLElement>('[data-scene-nav-item="intro-websocket"]')?.click()
    await nextTick()

    expect(onNavigate).toHaveBeenCalledWith('intro-websocket')
    expect(document.querySelector('[data-scene-nav-palette][data-state="open"]')).toBeNull()

    app.unmount()
    host.remove()
  })

  it('opens palette on Ctrl+K and closes with Escape', async () => {
    const { app, host } = await mountSceneNavigator()

    window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: 'k' }))
    await nextTick()
    expect(document.querySelector('[data-scene-nav-palette][data-state="open"]')).not.toBeNull()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(document.querySelector('[data-scene-nav-palette][data-state="open"]')).toBeNull()

    app.unmount()
    host.remove()
  })

  it('navigates with prev/next buttons', async () => {
    const onNavigate = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/intro-chat', component: { template: '<div />' } },
        { path: '/intro-websocket', component: { template: '<div />' } },
      ],
    })
    await router.push('/intro-chat')
    await router.isReady()

    const currentSceneId = ref('intro-websocket')
    const app = createApp({
      render: () => h(ScreenNavigator, {
        currentSceneId,
        onNavigate,
        scenes,
      }),
    })
    app.use(router)

    app.mount(host)
    await nextTick()

    host.querySelector<HTMLElement>('[data-scene-nav-prev]')?.click()
    expect(onNavigate).toHaveBeenCalledWith('intro-chat')

    onNavigate.mockClear()
    currentSceneId.value = 'intro-chat'
    await nextTick()
    host.querySelector<HTMLElement>('[data-scene-nav-next]')?.click()
    expect(onNavigate).toHaveBeenCalledWith('intro-websocket')

    app.unmount()
    host.remove()
  })

  it('supports ArrowLeft, ArrowRight, and Space shortcuts for scene navigation', async () => {
    const onNavigate = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/intro-chat', component: { template: '<div />' } },
        { path: '/intro-websocket', component: { template: '<div />' } },
      ],
    })
    await router.push('/intro-chat')
    await router.isReady()

    const currentSceneId = ref('intro-websocket')
    const app = createApp({
      render: () => h(ScreenNavigator, {
        currentSceneId,
        onNavigate,
        scenes,
      }),
    })
    app.use(router)

    app.mount(host)
    await nextTick()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
    await nextTick()
    expect(onNavigate).toHaveBeenCalledWith('intro-chat')

    onNavigate.mockClear()
    currentSceneId.value = 'intro-chat'
    await nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    await nextTick()
    expect(onNavigate).toHaveBeenCalledWith('intro-websocket')

    onNavigate.mockClear()
    currentSceneId.value = 'intro-chat'
    await nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Space' }))
    await nextTick()
    expect(onNavigate).toHaveBeenCalledWith('intro-websocket')

    app.unmount()
    host.remove()
  })

  it('supports ArrowUp/ArrowDown navigation and Enter select in jump dialog', async () => {
    const onNavigate = vi.fn()
    const { app, host } = await mountSceneNavigator(onNavigate)

    host.querySelector<HTMLElement>('[data-scene-nav-jump]')?.click()
    await nextTick()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    await nextTick()
    expect(document.querySelector('[data-scene-nav-item="intro-websocket"][data-scene-nav-active="true"]')).not.toBeNull()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }))
    await nextTick()
    expect(document.querySelector('[data-scene-nav-item="intro-chat"][data-scene-nav-active="true"]')).not.toBeNull()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    await nextTick()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await nextTick()

    expect(onNavigate).toHaveBeenCalledWith('intro-websocket')
    expect(document.querySelector('[data-scene-nav-palette][data-state="open"]')).toBeNull()

    app.unmount()
    host.remove()
  })
})
