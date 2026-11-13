import type { BackdropSurfaceHost } from '@proj-airi/stage-ui/composables/backdrop-surface'
import type { AiriCard } from '@proj-airi/stage-ui/stores/modules/airi-card'

import en from '@proj-airi/i18n/locales/en'

import { backdropSurfaceHostKey } from '@proj-airi/stage-ui/composables/backdrop-surface'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { useSpeechOutputControlStore } from '@proj-airi/stage-ui/stores/speech-output-control'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { computed, defineComponent, h, nextTick, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import ControlsIsland from './index.vue'

import { controlsIslandPlacementKey } from './use-controls-island-placement'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

const invokes = vi.hoisted(() => ({
  openSettings: undefined as unknown as ReturnType<typeof import('vitest').vi.fn>,
  startLogin: undefined as unknown as ReturnType<typeof import('vitest').vi.fn>,
}))

const authState = vi.hoisted(() => ({
  credits: { value: 0 },
  // The Flux line reads the Capacitor state. Null means no active Capacitor.
  capacitorPercent: { value: null as number | null },
  capacitorRechargesAt: { value: null as string | null },
  isAuthenticated: { value: false },
  needsLogin: { value: false },
  sessionVersion: { value: 0 },
  token: { value: null as string | null },
  user: { value: null as { createdAt: Date, email: string, emailVerified: boolean, id: string, image?: string, name: string, updatedAt: Date } | null },
  userId: { value: 'local' },
  consumeLoginRequest: async () => true,
  onAuthenticated: () => () => {},
  onLogout: () => () => {},
}))

vi.mock('@proj-airi/electron-vueuse', async () => {
  const { vi } = await import('vitest')
  invokes.openSettings = vi.fn().mockResolvedValue(undefined)
  invokes.startLogin = vi.fn().mockResolvedValue(undefined)
  const { electronAuthStartLogin, electronOpenSettings } = await import('../../../../shared/eventa')
  return {
    useElectronEventaContext: () => ref({ on: vi.fn(() => vi.fn()), emit: vi.fn() }),
    useElectronEventaInvoke: (event: unknown) => {
      if (event === electronOpenSettings)
        return invokes.openSettings
      if (event === electronAuthStartLogin)
        return invokes.startLogin
      return vi.fn().mockResolvedValue(false)
    },
    useElectronMouseInElement: () => ({ isOutside: ref(false) }),
  }
})

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

function card(name: string): AiriCard {
  return {
    name,
    version: '1.0.0',
    extensions: {
      airi: {
        avatarModels: [],
        modules: {
          consciousness: { provider: '', model: '' },
          vision: { provider: '', model: '' },
          speech: { provider: '', model: '', voice_id: '' },
        },
        agents: {},
      },
    },
  }
}

/** The stage page holds the Island through a template ref and calls what it exposes. */
interface IslandExposed { openMenu: () => void, overlayActive: boolean }

function mountIsland(provide: Record<symbol, unknown> = {}) {
  const pinia = createPinia()
  const island = ref<IslandExposed>()
  const Host = defineComponent({
    props: { cursorAway: { type: Boolean, default: false } },
    setup: props => () => h(ControlsIsland, { ref: island, cursorAway: props.cursorAway }),
  })
  const screen = render(Host, {
    global: {
      provide: {
        [controlsIslandPlacementKey as symbol]: {
          dock: ref('bottom-right'),
          isTop: computed(() => false),
          isLeft: computed(() => false),
          motionPhase: ref('idle'),
        },
        ...provide,
      },
      plugins: [pinia, i18n],
      directives: { 'track-button': {} },
    },
  })

  return { screen, pinia, island }
}

function signIn() {
  authState.token.value = 'user-token'
  authState.user.value = { id: 'user-1', name: 'Airi User', email: 'user@example.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() }
  authState.isAuthenticated.value = true
  authState.credits.value = 1200
}

const menuItem = (testId: string) => page.getByTestId(testId)

let unreadCount = 2

beforeEach(async () => {
  unreadCount = 2
  localStorage.clear()
  await page.viewport(900, 700)
  // Cloud is the HTTP boundary of the notifications.
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const request = input instanceof Request ? input : new Request(input)
    const { pathname } = new URL(request.url)
    if (pathname === '/v1/inbox/unread-count')
      return Promise.resolve(Response.json({ unread: unreadCount }))
    if (pathname === '/v1/inbox') {
      return Promise.resolve(Response.json({
        messages: [
          { id: 'm1', kind: 'flux.granted', params: { amount: 500, reason: 'Thanks for testing AIRI.' }, readAt: '', createdAt: '2026-10-18T08:00:00Z' },
        ],
        nextCursor: '',
      }))
    }
    return Promise.resolve(Response.json({}))
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  invokes.openSettings.mockClear()
  invokes.startLogin.mockClear()
  authState.isAuthenticated.value = false
  authState.needsLogin.value = false
  authState.token.value = null
  authState.user.value = null
  authState.credits.value = 0
  authState.capacitorPercent.value = null
  localStorage.clear()
})

describe('controls Island', () => {
  it('shows only the grip, the microphone, the chat button, and the more button', async () => {
    const { screen } = mountIsland()

    await expect.element(screen.getByTestId('controls-island-grip')).toBeVisible()
    await expect.element(screen.getByTestId('controls-island-microphone')).toBeVisible()
    await expect.element(screen.getByLabelText(label('open-chat'), { exact: true })).toBeVisible()
    await expect.element(screen.getByTestId('controls-island-more')).toBeVisible()
    // Account, settings and quit live in the menu, not on the Island.
    expect(document.querySelector('[data-testid="controls-island-account"]')).toBeNull()
    expect(document.querySelector('[data-testid="controls-island-settings"]')).toBeNull()
  })

  it('hides the Island while the cursor is away unless its menu is open or it holds focus', async () => {
    const { screen } = mountIsland()
    const island = screen.getByTestId('controls-island').element()

    await screen.rerender({ cursorAway: true })
    await expect.poll(() => island.classList.contains('opacity-0')).toBe(true)

    await screen.rerender({ cursorAway: false })
    await screen.getByTestId('controls-island-more').click()
    await expect.element(menuItem('controls-island-settings')).toBeVisible()
    await screen.rerender({ cursorAway: true })
    await expect.poll(() => island.classList.contains('opacity-100')).toBe(true)
  })

  it('closes the menu when the window loses focus to another app', async () => {
    const { screen } = mountIsland()

    await screen.getByTestId('controls-island-more').click()
    await expect.element(menuItem('controls-island-settings')).toBeVisible()

    window.dispatchEvent(new Event('blur'))

    await expect.poll(() => document.querySelector('[data-testid="controls-island-settings"]')).toBeNull()
  })

  it('opens the menu from the stage, for a right-click on the character', async () => {
    const { island } = mountIsland()
    await vi.waitFor(() => expect(island.value).toBeDefined())

    island.value!.openMenu()

    await expect.element(menuItem('controls-island-settings')).toBeVisible()
  })

  it('keeps the window interactive while the portaled menu is open', async () => {
    const { screen, island } = mountIsland()
    await vi.waitFor(() => expect(island.value).toBeDefined())
    expect(island.value!.overlayActive).toBe(false)

    await screen.getByTestId('controls-island-more').click()
    await expect.element(menuItem('controls-island-settings')).toBeVisible()

    expect(island.value!.overlayActive).toBe(true)
  })

  it('raises portaled control tooltips above the stage', async () => {
    const { screen } = mountIsland()

    await screen.getByTestId('controls-island-microphone').hover()

    const tooltipWrapper = '[data-reka-popper-content-wrapper]'
    await expect.poll(() => document.querySelector(tooltipWrapper)).not.toBeNull()
    expect(getComputedStyle(document.querySelector(tooltipWrapper)!).zIndex).toBe('1000')
  })
})

describe('controls Island menu account', () => {
  it('offers sign-in without Flux or Notifications while signed out', async () => {
    const { screen } = mountIsland()

    await screen.getByTestId('controls-island-more').click()
    await menuItem('controls-island-sign-in').click()

    expect(invokes.startLogin).toHaveBeenCalledOnce()
    expect(document.querySelector('[data-testid="controls-island-flux"]')).toBeNull()
    expect(document.querySelector('[data-testid="controls-island-subscription"]')).toBeNull()
    expect(document.querySelector('[data-testid="controls-island-notifications"]')).toBeNull()
    expect(document.querySelector('[data-testid="controls-island-notifications-dot"]')).toBeNull()
  })

  it('starts a sign-in that another surface requested', async () => {
    authState.needsLogin.value = true
    mountIsland()

    await vi.waitFor(() => expect(invokes.startLogin).toHaveBeenCalledOnce())
  })

  it('shows the account with its Flux balance and opens the account page', async () => {
    signIn()
    const { screen } = mountIsland()

    await screen.getByTestId('controls-island-more').click()
    const account = menuItem('controls-island-account')
    await expect.element(account).toHaveTextContent('Airi User')
    await expect.element(menuItem('controls-island-flux')).toHaveTextContent('1,200 Flux')
    // An account without a picture shows a beam avatar made from its ID.
    expect(account.element().querySelector('[data-beam-avatar]')).not.toBeNull()

    await account.click()

    expect(invokes.openSettings).toHaveBeenCalledWith({ route: '/settings/account' })
  })

  it('opens the Subscription page from its row', async () => {
    signIn()
    const { screen } = mountIsland()

    await screen.getByTestId('controls-island-more').click()
    const subscription = menuItem('controls-island-subscription')
    await expect.element(subscription).toHaveTextContent('Subscription')

    await subscription.click()

    expect(invokes.openSettings).toHaveBeenCalledWith({ route: '/settings/flux' })
  })

  it('shows the Capacitor percent instead of the Flux balance for a subscriber', async () => {
    signIn()
    authState.capacitorPercent.value = 40
    const { screen } = mountIsland()

    await screen.getByTestId('controls-island-more').click()
    const flux = menuItem('controls-island-flux')
    await expect.element(flux).toHaveTextContent('40%')
    await expect.element(flux).not.toHaveTextContent('Flux')
  })

  it('shows a dot on the more button, a capped count, and the list in a submenu', async () => {
    unreadCount = 12345
    signIn()
    const { screen } = mountIsland()

    const dot = screen.getByTestId('controls-island-notifications-dot')
    await expect.element(dot).toBeInTheDocument()
    expect(dot.element().textContent).toBe('')

    await screen.getByTestId('controls-island-more').click()
    await expect.element(menuItem('controls-island-notifications-count')).toHaveTextContent('99+')

    await menuItem('controls-island-notifications').click()

    await expect.element(menuItem('controls-island-notifications-view')).toBeVisible()
    await expect.element(page.getByRole('button', { name: /You received 500 Flux/ })).toBeVisible()
  })
})

describe('controls Island menu controls', () => {
  it('declares the open menu and its submenus as glass surfaces', async () => {
    // The desktop host draws native glass only behind declared surfaces, and the menu floats over the stage.
    const registered = new Set<HTMLElement>()
    const host: BackdropSurfaceHost = {
      register(element) {
        registered.add(element)
        return () => registered.delete(element)
      },
    }
    const { screen, pinia } = mountIsland({ [backdropSurfaceHostKey as symbol]: host })
    useAiriCardStore(pinia).cards.set('iru', card('Iru'))
    const menus = () => [...registered].filter(element => element.getAttribute('role') === 'menu')

    await screen.getByTestId('controls-island-more').click()
    await expect.poll(() => menus().length).toBe(1)
    expect(menus()[0].contains(document.querySelector('[data-testid="controls-island-settings"]'))).toBe(true)

    await menuItem('controls-island-character').click()
    await expect.element(page.getByRole('menuitemradio', { name: 'Iru' })).toBeVisible()
    await expect.poll(() => menus().length).toBe(2)

    window.dispatchEvent(new Event('blur'))
    await expect.poll(() => menus().length).toBe(0)
  })

  it('declares only the capsule of the Island as a glass surface', async () => {
    // The Island is one layer. A button with its own glass draws a second layer inside the capsule.
    const registered = new Set<HTMLElement>()
    const host: BackdropSurfaceHost = {
      register(element) {
        registered.add(element)
        return () => registered.delete(element)
      },
    }
    const { screen } = mountIsland({ [backdropSurfaceHostKey as symbol]: host })
    const capsule = screen.getByTestId('main-controls').element()

    await expect.poll(() => registered.has(capsule as HTMLElement)).toBe(true)
    expect([...registered].filter(element => element.tagName === 'BUTTON')).toEqual([])
  })

  it('switches the character from the Character submenu', async () => {
    const { screen, pinia } = mountIsland()
    const cards = useAiriCardStore(pinia)
    cards.cards.set('iru', card('Iru'))
    cards.cards.set('relu', card('ReLU'))
    cards.activeCardId = 'iru'

    await screen.getByTestId('controls-island-more').click()
    await expect.element(menuItem('controls-island-character')).toHaveTextContent('Iru')
    await menuItem('controls-island-character').click()
    await page.getByRole('menuitemradio', { name: 'ReLU' }).click()

    await expect.poll(() => cards.activeCardId).toBe('relu')
    // The switch goes through `activateCard`, so the choice survives a restart.
    expect(localStorage.getItem('airi-card-active-id')).toBe('relu')
  })

  it('mutes and unmutes the character voice', async () => {
    const { screen, pinia } = mountIsland()
    const speech = useSpeechOutputControlStore(pinia)

    await screen.getByTestId('controls-island-more').click()
    const voice = menuItem('controls-island-character-voice')
    await expect.element(voice).toHaveAttribute('aria-checked', 'true')

    await voice.click()

    await expect.element(voice).toHaveAttribute('aria-checked', 'false')
    expect(speech.speechMuted).toBe(true)
  })

  it('keeps the window on top through the menu switch', async () => {
    const { screen, pinia } = mountIsland()
    const settings = useSettings(pinia)
    const before = settings.alwaysOnTop

    await screen.getByTestId('controls-island-more').click()
    await menuItem('controls-island-keep-on-top').click()
    await nextTick()

    expect(settings.alwaysOnTop).toBe(!before)
  })

  it('opens Hearing controls from the menu and closes the menu', async () => {
    const { screen } = mountIsland()

    await screen.getByTestId('controls-island-more').click()
    await menuItem('controls-island-hearing-controls').click()

    await expect.element(page.getByTestId('hearing-config-dialog')).toBeVisible()
    await expect.poll(() => document.querySelector('[data-testid="controls-island-settings"]')).toBeNull()
  })

  it('opens settings from the menu', async () => {
    const { screen } = mountIsland()

    await screen.getByTestId('controls-island-more').click()
    await menuItem('controls-island-settings').click()

    expect(invokes.openSettings).toHaveBeenCalledWith({ route: '/settings' })
  })
})
