import en from '@proj-airi/i18n/locales/en'

import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { computed, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import ControlsIsland from './index.vue'

import { controlsIslandPlacementKey } from './use-controls-island-placement'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

const authState = vi.hoisted(() => ({
  credits: { value: 0 },
  isAuthenticated: { value: false },
  needsLogin: { value: false },
  sessionVersion: { value: 0 },
  token: { value: null as string | null },
  user: { value: null as { createdAt: Date, email: string, emailVerified: boolean, id: string, name: string, updatedAt: Date } | null },
  userId: { value: 'local' },
  onAuthenticated: () => () => {},
  onLogout: () => () => {},
}))

vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaContext: () => ref({ on: vi.fn(() => vi.fn()), emit: vi.fn() }),
  useElectronEventaInvoke: () => vi.fn().mockResolvedValue(false),
  useElectronMouseInElement: () => ({ isOutside: ref(false) }),
}))

vi.mock('@moeru/eventa', async importOriginal => ({
  ...await importOriginal<typeof import('@moeru/eventa')>(),
  defineInvoke: () => vi.fn(),
}))

vi.mock('@proj-airi/stage-ui/stores/auth', async () => {
  const { reactive, ref } = await import('vue')
  authState.credits = ref(0)
  authState.isAuthenticated = ref(false)
  authState.needsLogin = ref(false)
  authState.sessionVersion = ref(0)
  authState.token = ref(null)
  authState.user = ref(null)
  authState.userId = ref('local')

  // Pinia unwraps store refs. The inbox store reads `auth.token`, not `auth.token.value`.
  const store = reactive(authState)
  return { useAuthStore: () => store }
})

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
const label = (key: string) => i18n.global.t(`tamagotchi.stage.controls-island.${key}`)

function mountIsland() {
  const dock = ref<'bottom-right'>('bottom-right')
  return render(ControlsIsland, {
    global: {
      provide: {
        [controlsIslandPlacementKey as symbol]: {
          dock,
          isTop: computed(() => false),
          isLeft: computed(() => false),
          motionPhase: ref('idle'),
        },
      },
      plugins: [createPinia(), i18n],
      directives: { 'track-button': {} },
    },
  })
}

describe('controls Island notifications', () => {
  beforeEach(async () => {
    await page.viewport(900, 640)
    // Cloud is the HTTP boundary of the notifications row.
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const request = input instanceof Request ? input : new Request(input)
      const { pathname } = new URL(request.url)
      if (pathname === '/v1/inbox/unread-count')
        return Promise.resolve(Response.json({ unread: 2 }))
      if (pathname === '/v1/inbox') {
        return Promise.resolve(Response.json({
          messages: [
            { id: 'm1', kind: 'flux.granted', params: { amount: 500, reason: 'Thanks for testing AIRI.' }, readAt: '', createdAt: '2026-10-18T08:00:00Z' },
            { id: 'm2', kind: 'subscription.payment_failed', params: { plan: 'Pro', retryAt: '2026-10-20T00:00:00Z' }, readAt: '', createdAt: '2026-10-17T08:00:00Z' },
          ],
          nextCursor: '',
        }))
      }
      return Promise.resolve(Response.json({}))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    authState.isAuthenticated.value = false
    authState.token.value = null
    authState.user.value = null
  })

  it('hides the bell and the dot while signed out', async () => {
    const screen = mountIsland()

    await screen.getByLabelText(label('expand'), { exact: true }).click()
    await expect.element(screen.getByTestId('controls-menu')).toBeVisible()
    expect(document.querySelector('[data-testid="controls-island-notifications"]')).toBeNull()
    expect(document.querySelector('[data-testid="controls-island-notifications-dot"]')).toBeNull()
  })

  it('switches the menu to the list in place and back', async () => {
    authState.token.value = 'user-1-token'
    authState.user.value = { id: 'user-1', name: 'Neko', email: 'neko@example.test', emailVerified: true, createdAt: new Date(), updatedAt: new Date() }
    authState.isAuthenticated.value = true
    const screen = mountIsland()

    await expect.element(screen.getByTestId('controls-island-notifications-dot')).toBeInTheDocument()

    await screen.getByLabelText(label('expand'), { exact: true }).click()
    const bell = screen.getByRole('button', { name: 'Open notifications, 2 unread' })
    await expect.element(bell).toBeVisible()

    await bell.click()
    const menu = screen.getByTestId('controls-menu').element()
    const list = screen.getByTestId('controls-island-notifications-view')
    await expect.element(list).toBeVisible()
    // The list replaces the controls inside the same menu card. No new floating card opens.
    expect(menu.contains(list.element())).toBe(true)
    expect(document.querySelectorAll('[data-reka-popper-content-wrapper]').length).toBe(0)
    await expect.element(screen.getByRole('button', { name: /You received 500 Flux/ })).toBeVisible()
    await expect.element(screen.getByLabelText(label('open-settings'), { exact: true })).not.toBeVisible()

    await screen.getByRole('button', { name: 'Back' }).click()
    await expect.element(screen.getByLabelText(label('open-settings'), { exact: true })).toBeVisible()
    expect(document.querySelector('[data-testid="controls-island-notifications-view"]')).toBeNull()
  })
})
