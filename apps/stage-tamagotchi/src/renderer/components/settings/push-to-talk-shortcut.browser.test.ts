import type { ShortcutAccelerator } from '@proj-airi/stage-shared/global-shortcut'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { createI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import PushToTalkShortcut from './push-to-talk-shortcut.vue'

const STORAGE_KEY = 'settings/hearing/push-to-talk-shortcut'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

async function renderRecorder() {
  const pinia = createPinia()
  const view = render(PushToTalkShortcut, { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })] } })
  onTestFinished(() => {
    view.unmount()
    disposePinia(pinia)
  })
  const showError = vi.spyOn(toast, 'error')
  return { view, showError }
}

function storedAccelerator(): ShortcutAccelerator | undefined {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? JSON.parse(raw) : undefined
}

describe('push to talk shortcut recorder', () => {
  it('rejects Shift+Space, because Shift alone occurs in ordinary typing', async () => {
    const { view, showError } = await renderRecorder()

    await view.getByRole('button', { name: 'Ctrl + Shift + Space' }).click()
    await userEvent.keyboard('{Shift>}{Space}{/Shift}')

    await vi.waitFor(() => expect(showError).toHaveBeenCalledWith('tamagotchi.settings.pages.system.window-shortcuts.errors.requiresHoldModifier'))
    expect(storedAccelerator()?.modifiers).not.toEqual(['shift'])
  })

  it('rejects Shift with a letter', async () => {
    const { view, showError } = await renderRecorder()

    await view.getByRole('button', { name: 'Ctrl + Shift + Space' }).click()
    await userEvent.keyboard('{Shift>}{KeyA}{/Shift}')

    await vi.waitFor(() => expect(showError).toHaveBeenCalledWith('tamagotchi.settings.pages.system.window-shortcuts.errors.requiresHoldModifier'))
    expect(storedAccelerator()?.key).not.toBe('KeyA')
  })

  it('accepts a function key with Shift', async () => {
    const { view, showError } = await renderRecorder()

    await view.getByRole('button', { name: 'Ctrl + Shift + Space' }).click()
    await userEvent.keyboard('{Shift>}{F2}{/Shift}')

    await vi.waitFor(() => expect(storedAccelerator()).toEqual({ modifiers: ['shift'], key: 'F2' }))
    expect(showError).not.toHaveBeenCalled()
  })

  it('accepts Alt with a letter', async () => {
    const { view, showError } = await renderRecorder()

    await view.getByRole('button', { name: 'Ctrl + Shift + Space' }).click()
    await userEvent.keyboard('{Alt>}{KeyP}{/Alt}')

    await vi.waitFor(() => expect(storedAccelerator()).toEqual({ modifiers: ['alt'], key: 'KeyP' }))
    expect(showError).not.toHaveBeenCalled()
  })
})
