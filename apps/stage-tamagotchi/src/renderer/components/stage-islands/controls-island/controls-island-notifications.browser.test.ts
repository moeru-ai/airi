import en from '@proj-airi/i18n/locales/en'

import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { computed, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import ControlsIsland from './index.vue'

import { electronOpenSettings } from '../../../../shared/eventa'
import { controlsIslandPlacementKey } from './use-controls-island-placement'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

const authState = vi.hoisted(() => ({
  credits: { value: 0 },
  // The Flux row reads the Capacitor state. Null means no active Capacitor.
  capacitorPercent: { value: null as number | null },
  capacitorRechargesAt: { value: null as string | null },
  isAuthenticated: { value: false },
  needsLogin: { value: false },
  sessionVersion: { value: 0 },
  token: { value: null as string | null },
  user: { value: null as { createdAt: Date, email: string, emailVerified: boolean, id: string, name: string, updatedAt: Date } | null },
  userId: { value: 'local' },
  onAuthenticated: () => () => {},
  onLogout: () => () => {},
}))
const openSettings = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaContext: () => ref({ on: vi.fn(() => vi.fn()), emit: vi.fn() }),
  useElectronEventaInvoke: (event: unknown) => event === electronOpenSettings ? openSettings : vi.fn().mockResolvedValue(false),
  useElectronMouseInElement: () => ({ isOutside: ref(false) }),
}))

vi.mock('@moeru/eventa', async importOriginal => ({
  ...await importOriginal<typeof import('@moeru/eventa')>(),
  defineInvoke: () => vi.fn(),
}))

vi.mock('@proj-airi/stage-ui/stores/auth', async () => {
  const { reactive, ref } = await import('vue')
  authState.credits = ref(0)
  authState.capacitorPercent = ref(null)
  authState.capacitorRechargesAt = ref(null)
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

let unreadCount = 2

describe('controls Island notifications', () => {
  beforeEach(async () => {
    unreadCount = 2
    openSettings.mockClear()
    await page.viewport(900, 640)
    // Cloud is the HTTP boundary of the notifications row.
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const request = input instanceof Request ? input : new Request(input)
      const { pathname } = new URL(request.url)
      if (pathname === '/v1/inbox/unread-count')
        return Promise.resolve(Response.json({ unread: unreadCount }))
      return Promise.resolve(Response.json({}))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    authState.isAuthenticated.value = false
    authState.token.value = null
    authState.user.value = null
  })

  it('hides the Notifications row and the dot while signed out', async () => {
    const screen = mountIsland()

    await screen.getByLabelText(label('expand'), { exact: true }).click()
    await expect.element(screen.getByTestId('controls-menu')).toBeVisible()
    expect(document.querySelector('[data-testid="controls-island-notifications"]')).toBeNull()
    expect(document.querySelector('[data-testid="controls-island-notifications-dot"]')).toBeNull()
  })

  it.each([
    { entry: 'account', route: '/settings/account' },
    { entry: 'flux', route: '/settings/flux' },
    { entry: 'notifications', route: '/settings/notifications' },
  ])('opens the $entry page in settings and collapses the Island', async ({ entry, route }) => {
    authState.token.value = 'user-1-token'
    authState.user.value = { id: 'user-1', name: 'Neko', email: 'neko@example.test', emailVerified: true, createdAt: new Date(), updatedAt: new Date() }
    authState.isAuthenticated.value = true
    const screen = mountIsland()

    await screen.getByLabelText(label('expand'), { exact: true }).click()
    const row = screen.getByTestId(`controls-island-${entry}`)
    await expect.element(row).toBeVisible()

    await row.click()
    expect(openSettings).toHaveBeenCalledExactlyOnceWith({ route })
    await expect.element(screen.getByLabelText(label('expand'), { exact: true })).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows a dot on the expand button and a capped count in the row', async () => {
    unreadCount = 12345
    authState.token.value = 'user-1-token'
    authState.user.value = { id: 'user-1', name: 'Neko', email: 'neko@example.test', emailVerified: true, createdAt: new Date(), updatedAt: new Date() }
    authState.isAuthenticated.value = true
    const screen = mountIsland()

    const expandDot = screen.getByTestId('controls-island-notifications-dot')
    await expect.element(expandDot).toBeInTheDocument()
    expect(expandDot.element().textContent).toBe('')

    await screen.getByLabelText(label('expand'), { exact: true }).click()
    const row = screen.getByRole('button', { name: 'Open notifications, 12345 unread' })
    await expect.element(row).toBeVisible()
    // The row is a menu row, so it shows the count. Badge caps it, so the menu card keeps its width.
    await expect.element(screen.getByTestId('controls-island-notifications-count')).toHaveTextContent('99+')
  })
})
