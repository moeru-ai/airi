import type { BackdropSurfaceHost } from '@proj-airi/stage-ui/composables/backdrop-surface'

import en from '@proj-airi/i18n/locales/en'

import { backdropSurfaceHostKey } from '@proj-airi/stage-ui/composables/backdrop-surface'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { computed, defineComponent, h, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import ControlsIsland from './index.vue'

import { controlsIslandPlacementKey } from './use-controls-island-placement'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

// The app menu opens in a window of its own. The scenario `controls-menu-window` in
// `packages/scenarios-stage-tamagotchi-electron` checks the menu and the handoff between the windows.

vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaContext: () => ref({ on: vi.fn(() => vi.fn()), emit: vi.fn() }),
  useElectronEventaInvoke: () => vi.fn().mockResolvedValue(false),
  useElectronMouseInElement: () => ({ isOutside: ref(false) }),
}))

vi.mock('@moeru/eventa', async importOriginal => ({
  ...await importOriginal<typeof import('@moeru/eventa')>(),
  defineInvoke: () => vi.fn(),
}))

// The Notifications and card stores read the account refs. Without an account the user is `local`.
vi.mock('@proj-airi/stage-ui/stores/auth', async () => {
  const { ref } = await import('vue')
  const auth = {
    credits: ref(0),
    isAuthenticated: ref(false),
    needsLogin: ref(false),
    user: ref(null),
    userId: ref('local'),
    onAuthenticated: () => () => {},
    onLogout: () => () => {},
  }
  return { useAuthStore: () => auth }
})

function mountIsland(provide: Record<symbol, unknown> = {}) {
  const Host = defineComponent({
    props: { cursorAway: { type: Boolean, default: false } },
    setup: props => () => h(ControlsIsland, { cursorAway: props.cursorAway }),
  })
  return render(Host, {
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
      plugins: [createPinia(), createI18n({ legacy: false, locale: 'en', messages: { en } })],
      directives: { 'track-button': {} },
    },
  })
}

beforeEach(async () => {
  localStorage.clear()
  await page.viewport(900, 700)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('controls Island', () => {
  it('hides the Island while the cursor is away unless its menu is open or it holds focus', async () => {
    const screen = mountIsland()
    const island = screen.getByTestId('controls-island').element()

    await screen.rerender({ cursorAway: true })
    await expect.poll(() => island.classList.contains('opacity-0')).toBe(true)

    await screen.rerender({ cursorAway: false })
    await screen.getByTestId('controls-island-more').click()
    await expect.element(screen.getByTestId('controls-island-more')).toHaveAttribute('aria-expanded', 'true')
    await screen.rerender({ cursorAway: true })
    await expect.poll(() => island.classList.contains('opacity-100')).toBe(true)
  })

  it('raises portaled control tooltips above the stage', async () => {
    const screen = mountIsland()

    await screen.getByTestId('controls-island-microphone').hover()

    const tooltipWrapper = '[data-reka-popper-content-wrapper]'
    await expect.poll(() => document.querySelector(tooltipWrapper)).not.toBeNull()
    // The shared `Tooltip` of the dock buttons stands at z-index 10000, and Reka UI copies it to the wrapper.
    expect(getComputedStyle(document.querySelector(tooltipWrapper)!).zIndex).toBe('10000')
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
    const screen = mountIsland({ [backdropSurfaceHostKey as symbol]: host })
    const capsule = screen.getByTestId('main-controls').element()

    await expect.poll(() => registered.has(capsule as HTMLElement)).toBe(true)
    expect([...registered].filter(element => element.tagName === 'BUTTON')).toEqual([])
  })
})
