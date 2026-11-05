// @vitest-environment jsdom

import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

import ControlsIslandAuthButton from './controls-island-auth-button.vue'

const subscriptions = vi.hoisted(() => ({ on: vi.fn(() => vi.fn()) }))
const invokes = vi.hoisted(() => ({ startLogin: vi.fn(), openSettings: vi.fn() }))

vi.mock('@proj-airi/stage-host-context', () => ({
  useHostEventaContext: () => ref({
    on: subscriptions.on,
  }),
  useHostAuth: () => ({ startLogin: invokes.startLogin }),
  useHostEventaInvoke: () => invokes.openSettings,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

function authenticate(auth: ReturnType<typeof useAuthStore>, image?: string) {
  const now = new Date()
  auth.user = { id: 'user', name: 'Rainbow Bird', email: 'user@example.com', emailVerified: true, image, createdAt: now, updatedAt: now }
  auth.session = { id: 'session', userId: 'user', token: 'session', expiresAt: new Date(now.getTime() + 3_600_000), createdAt: now, updatedAt: now }
}

describe('controlsIslandAuthButton', () => {
  const mountedApps: Array<{ app: ReturnType<typeof createApp>, host: HTMLElement }> = []
  let auth: ReturnType<typeof useAuthStore>
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    // A Kirie renderer consumes the login request. A web build starts the browser sign-in at once.
    vi.stubEnv('RUNTIME_ENVIRONMENT', 'kirie')
    pinia = createPinia()
    auth = useAuthStore(pinia)
    // Authentication starts a credit request. Keep it away from the network.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ flux: 9620 }))
  })

  afterEach(() => {
    for (const { app, host } of mountedApps) {
      app.unmount()
      host.remove()
    }
    mountedApps.length = 0
    invokes.startLogin.mockReset()
    invokes.openSettings.mockReset()
    disposePinia(pinia)
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  function mountComponent(active = ref(true)) {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      render: () => h(ControlsIslandAuthButton, { active: active.value }),
    })
    app.use(pinia)
    app.mount(host)
    mountedApps.push({ app, host })
    return host
  }

  it('starts a deferred login when the hidden menu becomes active', async () => {
    const active = ref(false)
    mountComponent(active)

    await auth.requestLogin()
    await nextTick()
    expect(invokes.startLogin).not.toHaveBeenCalled()
    expect(auth.needsLogin).toBe(true)

    active.value = true
    await vi.waitFor(() => expect(invokes.startLogin).toHaveBeenCalledOnce())
    expect(auth.needsLogin).toBe(false)
  })

  it('disposes both auth subscriptions when the menu unmounts', () => {
    authenticate(auth, 'https://example.com/broken-avatar.png')
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
    authenticate(auth)
    const host = mountComponent()

    const fallback = host.querySelector('[data-avatar-fallback]')
    expect(fallback).toBeTruthy()
    expect(fallback?.firstElementChild?.classList.contains('i-solar:user-circle-bold-duotone')).toBe(true)
  })

  it('tries the next avatar URL after the authenticated user changes', async () => {
    authenticate(auth, 'https://example.com/broken-avatar.png')
    const host = mountComponent()
    const previousImage = host.querySelector('[data-avatar-image]')

    auth.user!.image = 'https://example.com/new-avatar.png'
    await nextTick()

    const nextImage = host.querySelector('[data-avatar-image]')
    expect(nextImage).not.toBe(previousImage)
    expect(nextImage?.getAttribute('src')).toBe('https://example.com/new-avatar.png')
    expect(nextImage?.getAttribute('alt')).toBe('')
  })
})
