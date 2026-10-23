import type { ChatWindowPreferences } from '../../../shared/eventa'

import { FULLSCREEN_WORKSPACE_FLAG } from '@proj-airi/stage-ui/libs/feature-flags'
import { useFeatureFlagsStore } from '@proj-airi/stage-ui/stores/feature-flags'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'

import ChatWindowStyleMenu from './chat-window-style-menu.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

const mocks = vi.hoisted(() => ({
  getPreferences: vi.fn<() => Promise<ChatWindowPreferences>>(),
  setPreferences: vi.fn<(changes: Partial<ChatWindowPreferences>) => Promise<void>>(),
}))

// NOTICE:
// The preferences live in the Electron main process. The doubles answer for
// it, so the test controls when each saved choice settles.
// Removal condition: browser tests running inside an Electron renderer.
vi.mock('@proj-airi/electron-vueuse', async () => {
  const { electronChatWindowGetPreferences } = await import('../../../shared/eventa')
  return {
    useElectronEventaInvoke: (event: unknown) => event === electronChatWindowGetPreferences ? mocks.getPreferences : mocks.setPreferences,
  }
})

let pinia: ReturnType<typeof createPinia>

beforeEach(() => {
  // The experiments catalog offers the fullscreen mode only in the desktop app, and it reads the environment when the
  // store starts.
  vi.stubEnv('RUNTIME_ENVIRONMENT', 'electron')
  // The experiments store asks the Cloud for account policies. The local experiments need none.
  vi.stubGlobal('fetch', async () => Response.json({ flags: [] }))
  localStorage.clear()
  pinia = createPinia()
})

afterEach(() => {
  disposePinia(pinia)
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  localStorage.clear()
})

async function choose(style: string) {
  await page.getByRole('button', { name: 'tamagotchi.stage.chat-window.style.title' }).click()
  await page.getByRole('menuitemradio', { name: `tamagotchi.stage.chat-window.style.${style}` }).click()
}

describe('chatWindowStyleMenu', () => {
  it('rests the trigger in the secondary icon color of the title bar', async () => {
    // ROOT CAUSE:
    //
    // The trigger passed text-neutral-400 to GhostButton, whose own
    // text-neutral-700 comes later in the UnoCSS output. The icon was dark in
    // light mode and gray in dark mode.
    //
    // The trigger is now a plain button that owns its color, like the mute
    // button beside it.
    mocks.getPreferences.mockResolvedValue({ mode: 'legacy', placement: 'attached', danmaku: false, pinned: true })
    const screen = await render(ChatWindowStyleMenu, {
      global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })] },
    })
    onTestFinished(() => screen.unmount())
    const reference = document.createElement('div')
    reference.className = 'text-neutral-400'
    document.body.append(reference)
    onTestFinished(() => reference.remove())

    const trigger = page.getByRole('button', { name: 'tamagotchi.stage.chat-window.style.title' })
    await expect.element(trigger).toBeEnabled()
    expect(getComputedStyle(trigger.element()).color).toBe(getComputedStyle(reference).color)

    await trigger.click()
    const menu = page.getByRole('menu')
    await expect.element(menu).toHaveClass('bg-white')
    await expect.element(menu).not.toHaveClass('backdrop-blur-md')
  })

  it('keeps showing the latest choice when an earlier choice fails after it', async () => {
    // ROOT CAUSE:
    //
    // A failed choice put back what the menu showed before it, even when a
    // newer choice had replaced that meanwhile. The menu then disagreed with
    // the saved preferences.
    //
    // Only the latest choice now decides what the menu shows.
    useFeatureFlagsStore(pinia).setPreference(FULLSCREEN_WORKSPACE_FLAG.key, true)
    const saved: ChatWindowPreferences = { mode: 'floating', placement: 'attached', danmaku: false, pinned: true }
    const toLegacy = Promise.withResolvers<void>()
    const toFullscreen = Promise.withResolvers<void>()
    mocks.getPreferences.mockResolvedValue(saved)
    mocks.setPreferences.mockReturnValueOnce(toLegacy.promise).mockReturnValueOnce(toFullscreen.promise)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const screen = await render(ChatWindowStyleMenu, {
      global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })] },
    })
    onTestFinished(() => screen.unmount())
    await expect.element(page.getByRole('button', { name: 'tamagotchi.stage.chat-window.style.title' })).toBeEnabled()

    await choose('legacy')
    await choose('fullscreen')
    // The legacy switch fails, and its read of the saved preferences still
    // shows the floating mode that the newer choice is replacing.
    toLegacy.reject(new Error('The new chat window could not restore the draft'))
    await vi.waitFor(() => expect(mocks.getPreferences).toHaveBeenCalledTimes(2))
    toFullscreen.resolve()

    await page.getByRole('button', { name: 'tamagotchi.stage.chat-window.style.title' }).click()
    await expect.element(page.getByRole('menuitemradio', { name: 'tamagotchi.stage.chat-window.style.fullscreen' })).toHaveAttribute('aria-checked', 'true')
  })

  it('waits for the saved preferences and ignores the current style', async () => {
    const saved = Promise.withResolvers<ChatWindowPreferences>()
    mocks.getPreferences.mockReturnValue(saved.promise)
    mocks.setPreferences.mockClear()
    const screen = await render(ChatWindowStyleMenu, {
      global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })] },
    })
    onTestFinished(() => screen.unmount())
    const trigger = page.getByRole('button', { name: 'tamagotchi.stage.chat-window.style.title' })
    // The menu shows nothing until it knows what is saved.
    await expect.element(trigger).toBeDisabled()

    saved.resolve({ mode: 'floating', placement: 'attached', danmaku: false, pinned: true })
    await expect.element(trigger).toBeEnabled()
    await choose('floating')

    expect(mocks.setPreferences).not.toHaveBeenCalled()
  })

  it('offers the attached placement to a floating chat and saves only the placement', async () => {
    mocks.getPreferences.mockResolvedValue({ mode: 'floating', placement: 'attached', danmaku: true, pinned: false })
    mocks.setPreferences.mockReset()
    mocks.setPreferences.mockResolvedValue()
    const screen = await render(ChatWindowStyleMenu, {
      global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })] },
    })
    onTestFinished(() => screen.unmount())
    const trigger = page.getByRole('button', { name: 'tamagotchi.stage.chat-window.style.title' })
    await expect.element(trigger).toBeEnabled()

    await trigger.click()
    const attached = page.getByRole('menuitemcheckbox', { name: 'tamagotchi.stage.chat-window.style.attached' })
    await expect.element(attached).toHaveAttribute('aria-checked', 'true')
    await attached.click()

    // The message feed and the pin belong to the dock, so the menu leaves them to it.
    expect(mocks.setPreferences).toHaveBeenCalledWith({ placement: 'free' })
    await expect.element(attached).toHaveAttribute('aria-checked', 'false')
  })

  it('leaves the attached placement out of a chat that is not floating', async () => {
    mocks.getPreferences.mockResolvedValue({ mode: 'legacy', placement: 'attached', danmaku: false, pinned: true })
    const screen = await render(ChatWindowStyleMenu, {
      global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })] },
    })
    onTestFinished(() => screen.unmount())
    const trigger = page.getByRole('button', { name: 'tamagotchi.stage.chat-window.style.title' })
    await expect.element(trigger).toBeEnabled()

    await trigger.click()

    await expect.element(page.getByRole('menuitemradio', { name: 'tamagotchi.stage.chat-window.style.legacy' })).toBeVisible()
    expect(page.getByRole('menuitemcheckbox').elements()).toHaveLength(0)
  })

  it('shows the saved style again when a switch fails', async () => {
    mocks.getPreferences.mockResolvedValue({ mode: 'legacy', placement: 'attached', danmaku: false, pinned: true })
    mocks.setPreferences.mockRejectedValueOnce(new Error('The new chat window could not restore the draft'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const screen = await render(ChatWindowStyleMenu, {
      global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })] },
    })
    onTestFinished(() => screen.unmount())
    await expect.element(page.getByRole('button', { name: 'tamagotchi.stage.chat-window.style.title' })).toBeEnabled()

    await choose('floating')

    await page.getByRole('button', { name: 'tamagotchi.stage.chat-window.style.title' }).click()
    await expect.element(page.getByRole('menuitemradio', { name: 'tamagotchi.stage.chat-window.style.legacy' })).toHaveAttribute('aria-checked', 'true')
  })

  // The fullscreen chat shows in the fullscreen mode, so the menu offers it only while that experiment is on.
  it('leaves the fullscreen style out while the fullscreen workspace experiment is off', async () => {
    mocks.getPreferences.mockResolvedValue({ mode: 'floating', placement: 'attached', danmaku: false, pinned: true })
    const screen = await render(ChatWindowStyleMenu, {
      global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })] },
    })
    onTestFinished(() => screen.unmount())

    await page.getByRole('button', { name: 'tamagotchi.stage.chat-window.style.title' }).click()

    await expect.element(page.getByRole('menuitemradio', { name: 'tamagotchi.stage.chat-window.style.legacy' })).toBeVisible()
    expect(page.getByRole('menuitemradio', { name: 'tamagotchi.stage.chat-window.style.fullscreen' }).elements()).toHaveLength(0)
  })

  it('offers the fullscreen style while the fullscreen workspace experiment is on', async () => {
    useFeatureFlagsStore(pinia).setPreference(FULLSCREEN_WORKSPACE_FLAG.key, true)
    mocks.getPreferences.mockResolvedValue({ mode: 'floating', placement: 'attached', danmaku: false, pinned: true })
    const screen = await render(ChatWindowStyleMenu, {
      global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })] },
    })
    onTestFinished(() => screen.unmount())

    await page.getByRole('button', { name: 'tamagotchi.stage.chat-window.style.title' }).click()

    await expect.element(page.getByRole('menuitemradio', { name: 'tamagotchi.stage.chat-window.style.fullscreen' })).toBeVisible()
  })
})
