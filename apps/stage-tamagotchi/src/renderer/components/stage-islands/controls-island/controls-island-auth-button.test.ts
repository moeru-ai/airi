// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'

import ControlsIslandAuthButton from './controls-island-auth-button.vue'

const authState = {
  isAuthenticated: ref(true),
  user: ref({
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

  it('falls back to the account placeholder when the avatar fails to load', async () => {
    const host = mountComponent()
    const image = host.querySelector('img')

    expect(image).toBeTruthy()
    image!.dispatchEvent(new Event('error'))
    await nextTick()

    expect(host.querySelector('img')).toBeNull()
  })

  it('tries the next avatar URL after the authenticated user changes', async () => {
    const host = mountComponent()
    host.querySelector('img')!.dispatchEvent(new Event('error'))
    await nextTick()

    authState.user.value.image = 'https://example.com/new-avatar.png'
    await nextTick()

    expect(host.querySelector('img')?.getAttribute('src')).toBe('https://example.com/new-avatar.png')
  })
})
