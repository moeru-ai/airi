import en from '@proj-airi/i18n/locales/en'

import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { computed, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import ControlsIsland from './index.vue'

import { controlsIslandPlacementKey } from './use-controls-island-placement'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

vi.mock('@proj-airi/electron-vueuse', () => ({
  useElectronEventaContext: () => ref({ on: vi.fn(() => vi.fn()), emit: vi.fn() }),
  useElectronEventaInvoke: () => vi.fn().mockResolvedValue(false),
  useElectronMouseInElement: () => ({ isOutside: ref(false) }),
}))

vi.mock('@moeru/eventa', async importOriginal => ({
  ...await importOriginal<typeof import('@moeru/eventa')>(),
  defineInvoke: () => vi.fn(),
}))

// The card store reads the account refs to synchronize cards. Without an account the user is `local`.
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

/** `transitions` renders Vue transitions instead of stubs, so a test sees the elements that a user sees. */
function mountControlsIsland(options: { transitions?: boolean } = {}) {
  const pinia = createPinia()
  const dock = ref('bottom-right' as const)
  const screen = render(ControlsIsland, {
    global: {
      provide: {
        [controlsIslandPlacementKey as symbol]: {
          dock,
          isTop: computed(() => false),
          isLeft: computed(() => false),
          motionPhase: ref('idle'),
        },
      },
      plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })],
      directives: { 'track-button': {} },
      stubs: { transition: !options.transitions },
    },
  })
  const device = useSettingsAudioDevice(pinia)
  // The Island only asks the device store. The store owns the browser permission request, which a test cannot answer.
  const askPermission = vi.spyOn(device, 'askPermission')

  return { screen, device, askPermission }
}

beforeEach(async () => {
  localStorage.clear()
  await page.viewport(1100, 850)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
  document.documentElement.style.lineHeight = ''
})

describe('controls Island microphone', () => {
  it('turns the microphone on after permission and off again without opening Hearing controls', async () => {
    const { screen, device, askPermission } = mountControlsIsland()
    askPermission.mockResolvedValue(true)
    const microphone = screen.getByTestId('controls-island-microphone')

    await expect.element(microphone).toHaveAccessibleName('Turn on microphone')
    await microphone.click()

    await expect.element(microphone).toHaveAttribute('aria-pressed', 'true')
    await expect.element(microphone).toHaveAccessibleName('Turn off microphone')
    expect(device.enabled).toBe(true)
    expect(askPermission).toHaveBeenCalledOnce()
    expect(screen.getByTestId('hearing-config-dialog').query()).toBeNull()

    await microphone.click()

    await expect.element(microphone).toHaveAttribute('aria-pressed', 'false')
    expect(device.enabled).toBe(false)
    expect(askPermission).toHaveBeenCalledOnce()
  })

  it('ignores presses while the permission prompt is pending', async () => {
    const { screen, device, askPermission } = mountControlsIsland()
    const permission = Promise.withResolvers<boolean>()
    askPermission.mockReturnValue(permission.promise)
    const microphone = screen.getByTestId('controls-island-microphone')

    await microphone.click()
    await expect.element(microphone).toBeDisabled()
    ;(microphone.element() as HTMLButtonElement).click()

    expect(askPermission).toHaveBeenCalledOnce()
    expect(device.enabled).toBe(false)

    permission.resolve(true)

    await expect.element(microphone).toBeEnabled()
    await expect.element(microphone).toHaveAttribute('aria-pressed', 'true')
    expect(askPermission).toHaveBeenCalledOnce()
  })

  it('opens Hearing controls when the permission request fails', async () => {
    const { screen, device, askPermission } = mountControlsIsland()
    askPermission.mockResolvedValue(false)

    await screen.getByTestId('controls-island-microphone').click()

    await expect.element(screen.getByTestId('hearing-config-dialog')).toBeVisible()
    await expect.element(screen.getByTestId('hearing-microphone-switch')).toBeVisible()
    expect(device.enabled).toBe(false)
  })

  it('opens Hearing controls from the menu without asking for permission', async () => {
    const { screen, askPermission } = mountControlsIsland()

    await screen.getByLabelText('Expand').click()
    await screen.getByTestId('controls-island-hearing-controls').click()

    await expect.element(screen.getByTestId('hearing-config-dialog')).toBeVisible()
    expect(askPermission).not.toHaveBeenCalled()
  })

  it('keeps the microphone button in place when the microphone turns on', async () => {
    // The tooltip trigger lays out the button on a line, so the button's baseline decides its position.
    // A taller line makes a moved baseline visible as a moved button.
    document.documentElement.style.lineHeight = '2'
    const { screen, askPermission } = mountControlsIsland({ transitions: true })
    askPermission.mockResolvedValue(true)
    const microphone = screen.getByTestId('controls-island-microphone')
    await expect.element(microphone).toBeVisible()
    const before = microphone.element().getBoundingClientRect().top

    await microphone.click()

    await vi.waitFor(() => expect(microphone.element().querySelector('svg')).not.toBeNull())
    expect(microphone.element().getBoundingClientRect().top).toBe(before)
  })
})
