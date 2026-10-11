import type { ShortcutAccelerator, ShortcutBinding } from '@proj-airi/stage-shared/global-shortcut'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { userEvent } from 'vitest/browser'
import { createI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import PushToTalkShortcut from './push-to-talk-shortcut.vue'

const STORAGE_KEY = 'settings/hearing/push-to-talk-shortcut'

const listShortcuts = vi.hoisted(() => vi.fn<() => Promise<ShortcutBinding[]>>())

// NOTICE:
// The shortcut list comes from the Electron main process. The double answers with the bindings that each test registers.
// Removal condition: browser tests running inside an Electron renderer.
vi.mock('@proj-airi/electron-vueuse', () => ({
  getElectronEventaContext: vi.fn(),
  useElectronEventaInvoke: () => listShortcuts,
}))

beforeEach(() => {
  listShortcuts.mockResolvedValue([])
})

afterEach(() => {
  vi.restoreAllMocks()
  listShortcuts.mockReset()
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

  it('rejects the key combination of the Spotlight shortcut', async () => {
    // Review: https://github.com/moeru-ai/airi/pull/2729#discussion_r4239027482
    listShortcuts.mockResolvedValue([
      { id: 'spotlight', accelerator: { modifiers: ['ctrl', 'alt'], key: 'KeyP' }, scope: 'global' },
      { id: 'voice-push-to-talk', accelerator: { modifiers: ['ctrl', 'shift'], key: 'Space' }, scope: 'global', receiveKeyUps: true },
    ])
    const { view, showError } = await renderRecorder()

    await view.getByRole('button', { name: 'Ctrl + Shift + Space' }).click()
    await userEvent.keyboard('{Control>}{Alt>}{KeyP}{/Alt}{/Control}')

    await vi.waitFor(() => expect(showError).toHaveBeenCalledWith('tamagotchi.settings.pages.system.window-shortcuts.errors.conflict'))
    expect(storedAccelerator()).toEqual({ modifiers: ['ctrl', 'shift'], key: 'Space' })
  })

  it('accepts its own registered key combination', async () => {
    listShortcuts.mockResolvedValue([
      { id: 'voice-push-to-talk', accelerator: { modifiers: ['alt'], key: 'KeyP' }, scope: 'global', receiveKeyUps: true },
    ])
    const { view, showError } = await renderRecorder()

    await view.getByRole('button', { name: 'Ctrl + Shift + Space' }).click()
    await userEvent.keyboard('{Alt>}{KeyP}{/Alt}')

    await vi.waitFor(() => expect(storedAccelerator()).toEqual({ modifiers: ['alt'], key: 'KeyP' }))
    expect(showError).not.toHaveBeenCalled()
  })
})
