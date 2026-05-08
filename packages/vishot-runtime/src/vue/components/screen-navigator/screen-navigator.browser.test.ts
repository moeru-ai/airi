import { describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { createApp, h, nextTick, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

import ScreenNavigator from './screen-navigator.vue'

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

    await userEvent.keyboard('{Control>}k{/Control}')
    await nextTick()
    await vi.waitFor(() => {
      expect(document.querySelector('[data-scene-nav-palette][data-state="open"]')).not.toBeNull()
    })

    await userEvent.keyboard('{Escape}')
    await nextTick()
    await vi.waitFor(() => {
      expect(document.querySelector('[data-scene-nav-palette][data-state="open"]')).toBeNull()
    })

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

    await userEvent.keyboard('{ArrowLeft}')
    await nextTick()
    expect(onNavigate).toHaveBeenCalledWith('intro-chat')

    onNavigate.mockClear()
    currentSceneId.value = 'intro-chat'
    await nextTick()
    await userEvent.keyboard('{ArrowRight}')
    await nextTick()
    expect(onNavigate).toHaveBeenCalledWith('intro-websocket')

    onNavigate.mockClear()
    currentSceneId.value = 'intro-chat'
    await nextTick()
    await userEvent.keyboard('{Space}')
    await nextTick()
    expect(onNavigate).toHaveBeenCalledWith('intro-websocket')

    app.unmount()
    host.remove()
  })

  it('highlights the current scene in the jump dialog', async () => {
    const { app, host } = await mountSceneNavigator()

    host.querySelector<HTMLElement>('[data-scene-nav-jump]')?.click()
    await nextTick()

    await vi.waitFor(() => {
      expect(document.querySelector('[data-scene-nav-item="intro-chat"][data-highlighted]')).not.toBeNull()
    })

    app.unmount()
    host.remove()
  })
})
