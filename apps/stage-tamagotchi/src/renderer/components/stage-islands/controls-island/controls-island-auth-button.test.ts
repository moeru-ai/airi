// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

import ControlsIslandAuthButton from './controls-island-auth-button.vue'

import { electronAuthStartLogin } from '../../../../shared/eventa'

const subscriptions = vi.hoisted(() => ({ on: vi.fn(() => vi.fn()) }))
const invokes = vi.hoisted(() => ({ startLogin: vi.fn(), openSettings: vi.fn() }))

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
    on: subscriptions.on,
  }),
  useElectronEventaInvoke: (event: unknown) => event === electronAuthStartLogin ? invokes.startLogin : invokes.openSettings,
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
    authState.isAuthenticated.value = true
    authState.needsLogin.value = false
    invokes.startLogin.mockReset()
    invokes.openSettings.mockReset()
    authState.user.value.image = 'https://example.com/broken-avatar.png'
  })

  function mountComponent(active = ref(true)) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(ControlsIslandAuthButton, { active: active.value }),
    })
    app.mount(host)
    mountedApps.push({ app, host })
    return host
  }

  it('starts a deferred login when the hidden menu becomes active', async () => {
    authState.isAuthenticated.value = false
    const active = ref(false)
    mountComponent(active)

    authState.needsLogin.value = true
    await nextTick()
    expect(invokes.startLogin).not.toHaveBeenCalled()
    expect(authState.needsLogin.value).toBe(true)

    active.value = true
    await nextTick()
    expect(invokes.startLogin).toHaveBeenCalledOnce()
    expect(authState.needsLogin.value).toBe(false)
  })

  it('disposes both auth subscriptions when the menu unmounts', () => {
    subscriptions.on.mockClear()
    mountComponent()
    expect(subscriptions.on).toHaveBeenCalledTimes(2)
    const stops = subscriptions.on.mock.results.map(result => result.value)
    mountedApps[0]!.app.unmount()
    for (const stop of stops)
      expect(stop).toHaveBeenCalledOnce()
    mountedApps[0]!.host.remove()
    mountedApps.length = 0
  })

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
