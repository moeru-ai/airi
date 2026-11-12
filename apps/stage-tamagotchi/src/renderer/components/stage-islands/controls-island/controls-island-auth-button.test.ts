// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

import ControlsIslandAuthButton from './controls-island-auth-button.vue'

const subscriptions = vi.hoisted(() => ({ on: vi.fn(() => vi.fn()) }))
const invokes = vi.hoisted(() => ({ startLogin: vi.fn() }))

const authState = {
  isAuthenticated: ref(true),
  user: ref<{ id?: string, name: string, image?: string }>({
    name: 'Rainbow Bird',
    image: 'https://example.com/broken-avatar.png',
  }),
  needsLogin: ref(false),
  credits: ref(9620),
  // The Flux row reads the Capacitor state. Null means no active Capacitor.
  capacitorPercent: ref<number | null>(null),
  capacitorRechargesAt: ref<string | null>(null),
  consumeLoginRequest: vi.fn(async () => {
    authState.needsLogin.value = false
    return true
  }),
}

vi.mock('@proj-airi/stage-ui/stores/auth', () => ({
  useAuthStore: () => authState,
}))

vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaContext: () => ref({
    on: subscriptions.on,
  }),
  useElectronEventaInvoke: () => invokes.startLogin,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    // The Flux row formats the balance and the Capacitor percent for this locale.
    locale: ref('en'),
  }),
}))

describe('controlsIslandAuthButton', () => {
  const mountedApps: Array<{ app: ReturnType<typeof createApp>, host: HTMLElement }> = []
  const openSettings = vi.fn()

  afterEach(() => {
    for (const { app, host } of mountedApps) {
      app.unmount()
      host.remove()
    }
    mountedApps.length = 0
    authState.isAuthenticated.value = true
    authState.needsLogin.value = false
    authState.consumeLoginRequest.mockClear()
    invokes.startLogin.mockReset()
    openSettings.mockReset()
    authState.user.value.image = 'https://example.com/broken-avatar.png'
    authState.user.value.id = undefined
    authState.capacitorPercent.value = null
  })

  function mountComponent(active = ref(true)) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(ControlsIslandAuthButton, { active: active.value, onOpenSettings: openSettings }),
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
    expect(authState.consumeLoginRequest).toHaveBeenCalledOnce()
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

  it.each([
    { capacitorPercent: null, value: '9,620', route: '/settings/flux' },
    // The Flux page leads with the Capacitor, so a subscriber opens the same page.
    { capacitorPercent: 40, value: '40%', route: '/settings/flux' },
  ])('shows and opens the Flux entry of the current state (Capacitor $capacitorPercent)', async ({ capacitorPercent, value, route }) => {
    authState.capacitorPercent.value = capacitorPercent
    const host = mountComponent()
    await nextTick()

    const row = host.querySelector<HTMLButtonElement>('[data-testid="controls-island-flux"]')
    expect(row?.textContent).toContain(value)
    row?.click()
    expect(openSettings).toHaveBeenCalledWith(route)
  })

  it('hides the Flux entry from a signed-out user', () => {
    authState.isAuthenticated.value = false
    const host = mountComponent()

    expect(host.querySelector('[data-testid="controls-island-flux"]')).toBeNull()
  })

  it('renders the shared account fallback when no avatar is available', () => {
    authState.user.value.image = undefined
    const host = mountComponent()

    const fallback = host.querySelector('[data-avatar-fallback]')
    expect(fallback).toBeTruthy()
    expect(fallback?.firstElementChild?.classList.contains('i-solar:user-circle-bold-duotone')).toBe(true)
  })

  it('renders a beam avatar from the user ID when no avatar image is available', () => {
    authState.user.value.image = undefined
    authState.user.value.id = 'user-1'
    const host = mountComponent()

    const fallback = host.querySelector('[data-avatar-fallback]')
    expect(fallback?.querySelector('[data-beam-avatar]')).toBeTruthy()
    expect(fallback?.querySelector('.i-solar\\:user-circle-bold-duotone')).toBeNull()
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
