import type { DevicePermission, ShortcutTryEvent } from '../../../stores/device-permissions'

import en from '@proj-airi/i18n/locales/en'

import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import PermissionShortcutPage from './permission-shortcut-page.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

/** An Accessibility permission whose shortcut events the test sends, as the host does after a key press. */
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
  return { permission, stop, press: (event: ShortcutTryEvent) => send?.(event) }
}

function renderPage(permission: DevicePermission, granted: boolean) {
  return render(PermissionShortcutPage, {
    props: { permission, granted, waiting: false },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

describe('permission shortcut page', () => {
  it('shows the keys and reacts to a press from every app', async () => {
    const accessibility = fakeAccessibility()
    const screen = renderPage(accessibility.permission, true)

    await expect.element(screen.getByRole('img', { name: 'Ctrl + Shift + Space' })).toBeInTheDocument()
    await expect.element(screen.getByText('Hold the keys to try.')).toBeInTheDocument()

    accessibility.press({ phase: 'down', reach: 'every-app' })
    await expect.element(screen.getByRole('status')).toHaveTextContent('Listening')

    accessibility.press({ phase: 'up', reach: 'every-app' })
    await expect.element(screen.getByRole('status')).toHaveTextContent('It works. Try it in another app too.')
  })

  it('says that other apps need Accessibility after a press in this app only', async () => {
    const accessibility = fakeAccessibility()
    const screen = renderPage(accessibility.permission, false)

    accessibility.press({ phase: 'down', reach: 'this-app' })
    accessibility.press({ phase: 'up', reach: 'this-app' })

    await expect.element(screen.getByRole('status')).toHaveTextContent('It works here. Other apps need Accessibility.')
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
