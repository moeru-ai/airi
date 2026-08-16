// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

import ControlsIslandAuthButton from './controls-island-auth-button.vue'

const authState = {
  isAuthenticated: ref(true),
  user: ref<{ name: string, image?: string }>({
    name: 'Rainbow Bird',
    image: 'https://example.com/broken-avatar.png',
  }),
  needsLogin: ref(false),
  credits: ref(9620),
}

vi.mock('@proj-airi/stage-ui/stores/auth', () => ({
  useAuthStore: () => authState,
}))

vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaContext: () => ref({
    on: vi.fn(),
  }),
  useElectronEventaInvoke: () => vi.fn(),
}))

vi.mock('pinia', () => ({
  storeToRefs: (store: object) => store,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

describe('controlsIslandAuthButton', () => {
  const mountedApps: Array<{ app: ReturnType<typeof createApp>, host: HTMLElement }> = []

  afterEach(() => {
    for (const { app, host } of mountedApps) {
      app.unmount()
      host.remove()
    }
    mountedApps.length = 0
    authState.user.value.image = 'https://example.com/broken-avatar.png'
  })

  function mountComponent() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(ControlsIslandAuthButton),
    })
    app.mount(host)
    mountedApps.push({ app, host })
    return host
  }

  it('renders the shared account fallback when no avatar is available', () => {
    authState.user.value.image = undefined
    const host = mountComponent()

    const fallback = host.querySelector('[data-avatar-fallback]')
    expect(fallback).toBeTruthy()
    expect(fallback?.firstElementChild?.classList.contains('i-solar:user-circle-bold-duotone')).toBe(true)
  })

  it('tries the next avatar URL after the authenticated user changes', async () => {
    const host = mountComponent()
    const previousImage = host.querySelector('[data-avatar-image]')

    authState.user.value.image = 'https://example.com/new-avatar.png'
    await nextTick()

    const nextImage = host.querySelector('[data-avatar-image]')
    expect(nextImage).not.toBe(previousImage)
    expect(nextImage?.getAttribute('src')).toBe('https://example.com/new-avatar.png')
    expect(nextImage?.getAttribute('alt')).toBe('')
  })
})
