import type { DevicePermission, ShortcutTryEvent } from '../../../stores/device-permissions'

import en from '@proj-airi/i18n/locales/en'

import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import PermissionShortcutPage from './permission-shortcut-page.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

/** An Accessibility permission whose global presses the test sends, as the global hook of the host does. */
function fakeAccessibility() {
  let send: ((event: ShortcutTryEvent) => void) | undefined
  const stop = vi.fn()
  const permission: DevicePermission = {
    id: 'accessibility',
    kind: 'accessibility',
    titleKey: 'settings.dialogs.onboarding.permissions.accessibilityTitle',
    descriptionKey: 'settings.dialogs.onboarding.permissions.accessibilityDescription',
    shortcutKeys: () => ['Ctrl', 'Shift', 'Space'],
    tryShortcut: vi.fn((listener) => {
      send = listener
      return stop
    }),
    check: async () => 'granted',
    request: async () => {},
  }
  return { permission, stop, globalPress: (phase: ShortcutTryEvent['phase']) => send?.({ phase }) }
}

function renderPage(permission: DevicePermission, granted: boolean) {
  return render(PermissionShortcutPage, {
    props: { permission, granted, waiting: false },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

/** Key events in this window. `held` is the state of the modifiers after the event. */
function key(type: 'keydown' | 'keyup', code: string, held: { ctrl?: boolean, shift?: boolean }) {
  window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code, ctrlKey: !!held.ctrl, shiftKey: !!held.shift }))
}

function pressInWindow() {
  key('keydown', 'ControlLeft', { ctrl: true })
  key('keydown', 'ShiftLeft', { ctrl: true, shift: true })
  key('keydown', 'Space', { ctrl: true, shift: true })
}

function releaseInWindow() {
  key('keyup', 'Space', { ctrl: true, shift: true })
  key('keyup', 'ShiftLeft', { ctrl: true })
  key('keyup', 'ControlLeft', {})
}

describe('permission shortcut page', () => {
  it('listens only when the window sees every key of the shortcut', async () => {
    const accessibility = fakeAccessibility()
    const screen = renderPage(accessibility.permission, false)
    await expect.element(screen.getByText('Hold the keys to try.')).toBeInTheDocument()

    key('keydown', 'ControlLeft', { ctrl: true })
    await expect.element(screen.getByText('Hold the keys to try.')).toBeInTheDocument()

    key('keydown', 'ShiftLeft', { ctrl: true, shift: true })
    key('keydown', 'Space', { ctrl: true, shift: true })
    await expect.element(screen.getByRole('status')).toHaveTextContent('Listening')
  })

  it('says that other apps need Accessibility when only this window saw the press', async () => {
    const accessibility = fakeAccessibility()
    const screen = renderPage(accessibility.permission, false)

    pressInWindow()
    releaseInWindow()

    await expect.element(screen.getByRole('status')).toHaveTextContent('It works here. Other apps need Accessibility.')
  })

  it('says that the shortcut works everywhere when the global hook saw the press', async () => {
    const accessibility = fakeAccessibility()
    const screen = renderPage(accessibility.permission, true)

    pressInWindow()
    accessibility.globalPress('down')
    releaseInWindow()
    await expect.element(screen.getByRole('status')).toHaveTextContent('Listening')
    accessibility.globalPress('up')

    await expect.element(screen.getByRole('status')).toHaveTextContent('It works. Try it in another app too.')
  })

  it('reacts to a press in another app, which the window does not see', async () => {
    const accessibility = fakeAccessibility()
    const screen = renderPage(accessibility.permission, true)

    accessibility.globalPress('down')
    await expect.element(screen.getByRole('status')).toHaveTextContent('Listening')
    accessibility.globalPress('up')

    await expect.element(screen.getByRole('status')).toHaveTextContent('It works. Try it in another app too.')
  })

  it('listens again after the permission changes, and stops when it closes', async () => {
    const accessibility = fakeAccessibility()
    const screen = renderPage(accessibility.permission, false)

    await screen.rerender({ granted: true })
    await expect.poll(() => vi.mocked(accessibility.permission.tryShortcut!).mock.calls.length).toBe(2)
    expect(accessibility.stop).toHaveBeenCalledOnce()

    screen.unmount()
    expect(accessibility.stop).toHaveBeenCalledTimes(2)
  })
})
