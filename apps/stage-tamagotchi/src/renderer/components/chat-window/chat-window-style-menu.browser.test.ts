import type { ChatWindowPreferences } from '../../../shared/eventa'

import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'

import ChatWindowStyleMenu from './chat-window-style-menu.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

const mocks = vi.hoisted(() => ({
  getPreferences: vi.fn<() => Promise<ChatWindowPreferences>>(),
  setPreferences: vi.fn<(preferences: ChatWindowPreferences) => Promise<void>>(),
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
    mocks.getPreferences.mockResolvedValue({ mode: 'legacy', placement: 'attached', pinned: true })
    const screen = await render(ChatWindowStyleMenu, {
      global: { plugins: [createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })] },
    })
    onTestFinished(() => screen.unmount())
    const reference = document.createElement('div')
    reference.className = 'text-neutral-400'
    document.body.append(reference)
    onTestFinished(() => reference.remove())

    const trigger = page.getByRole('button', { name: 'tamagotchi.stage.chat-window.style.title' })
    await expect.element(trigger).toBeEnabled()
    expect(getComputedStyle(trigger.element()).color).toBe(getComputedStyle(reference).color)
  })

  it('keeps showing the latest choice when an earlier choice fails after it', async () => {
    // ROOT CAUSE:
    //
    // A failed choice put back what the menu showed before it, even when a
    // newer choice had replaced that meanwhile. The menu then disagreed with
    // the saved preferences.
    //
    // Only the latest choice now decides what the menu shows.
    const saved: ChatWindowPreferences = { mode: 'floating', placement: 'attached', pinned: true }
    const toLegacy = Promise.withResolvers<void>()
    const toFree = Promise.withResolvers<void>()
    mocks.getPreferences.mockResolvedValue(saved)
    mocks.setPreferences.mockReturnValueOnce(toLegacy.promise).mockReturnValueOnce(toFree.promise)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const screen = await render(ChatWindowStyleMenu, {
      global: { plugins: [createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })] },
    })
    onTestFinished(() => screen.unmount())
    await expect.element(page.getByRole('button', { name: 'tamagotchi.stage.chat-window.style.title' })).toBeEnabled()

    await choose('legacy')
    await choose('floating-free')
    // The legacy switch fails, and its read of the saved preferences still
    // shows the attached placement that the newer choice is replacing.
    toLegacy.reject(new Error('The new chat window could not restore the draft'))
    await vi.waitFor(() => expect(mocks.getPreferences).toHaveBeenCalledTimes(2))
    toFree.resolve()

    await page.getByRole('button', { name: 'tamagotchi.stage.chat-window.style.title' }).click()
    await expect.element(page.getByRole('menuitemradio', { name: 'tamagotchi.stage.chat-window.style.floating-free' })).toHaveAttribute('aria-checked', 'true')
  })

  it('waits for the saved preferences, offers the pin only to a free chat, and ignores the current style', async () => {
    const saved = Promise.withResolvers<ChatWindowPreferences>()
    mocks.getPreferences.mockReturnValue(saved.promise)
    mocks.setPreferences.mockClear()
    const screen = await render(ChatWindowStyleMenu, {
      global: { plugins: [createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })] },
    })
    onTestFinished(() => screen.unmount())
    const trigger = page.getByRole('button', { name: 'tamagotchi.stage.chat-window.style.title' })
    // A choice made before the preferences arrive would overwrite them.
    await expect.element(trigger).toBeDisabled()

    saved.resolve({ mode: 'floating', placement: 'attached', pinned: true })
    await expect.element(trigger).toBeEnabled()
    await choose('floating-attached')

    expect(mocks.setPreferences).not.toHaveBeenCalled()
    await trigger.click()
    await expect.element(page.getByRole('menuitemcheckbox')).not.toBeInTheDocument()
  })

  it('shows the saved style again when a switch fails', async () => {
    mocks.getPreferences.mockResolvedValue({ mode: 'legacy', placement: 'attached', pinned: true })
    mocks.setPreferences.mockRejectedValueOnce(new Error('The new chat window could not restore the draft'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const screen = await render(ChatWindowStyleMenu, {
      global: { plugins: [createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })] },
    })
    onTestFinished(() => screen.unmount())
    await expect.element(page.getByRole('button', { name: 'tamagotchi.stage.chat-window.style.title' })).toBeEnabled()

    await choose('floating-free')

    await page.getByRole('button', { name: 'tamagotchi.stage.chat-window.style.title' }).click()
    await expect.element(page.getByRole('menuitemradio', { name: 'tamagotchi.stage.chat-window.style.legacy' })).toHaveAttribute('aria-checked', 'true')
  })
})
