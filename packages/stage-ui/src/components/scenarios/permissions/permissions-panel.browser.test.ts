import type { DevicePermission, DevicePermissionStatus } from '../../../stores/device-permissions'

import en from '@proj-airi/i18n/locales/en'

import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import PermissionsPanel from './permissions-panel.vue'

import { useDevicePermissionsStore } from '../../../stores/device-permissions'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

/** A permission whose status the test changes. `request` grants it, as a user who allows the system prompt. */
function fakePermission(id: string, titleKey: string, initial: DevicePermissionStatus) {
  let status = initial
  const permission: DevicePermission = {
    id,
    titleKey,
    descriptionKey: 'settings.dialogs.onboarding.permissions.microphoneDescription',
    check: vi.fn(async () => status),
    request: vi.fn(async () => {
      status = 'granted'
    }),
  }
  return {
    permission,
    setStatus: (next: DevicePermissionStatus) => {
      status = next
    },
  }
}

async function renderPanel(permissions: DevicePermission[]) {
  const pinia = createPinia()
  useDevicePermissionsStore(pinia).register(permissions)
  return render(PermissionsPanel, {
    global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

describe('permissions panel', () => {
  it('shows the status of each permission and requests one that is not granted', async () => {
    const microphone = fakePermission('microphone', 'settings.dialogs.onboarding.permissions.microphoneTitle', 'not-determined')
    const accessibility = fakePermission('accessibility', 'settings.dialogs.onboarding.permissions.accessibilityTitle', 'granted')
    const screen = await renderPanel([microphone.permission, accessibility.permission])

    await expect.element(screen.getByRole('heading', { name: 'Accessibility' })).toBeInTheDocument()
    // A granted permission has no action. The other one asks the system.
    await expect.element(screen.getByRole('button', { name: 'Request access' })).toBeInTheDocument()
    await expect.poll(() => screen.getByRole('button').elements().length).toBe(1)

    await screen.getByRole('button', { name: 'Request access' }).click()

    expect(microphone.permission.request).toHaveBeenCalledOnce()
    await expect.poll(() => screen.getByRole('button').elements().length).toBe(0)
  })

  it('offers the system settings for a denied permission', async () => {
    const screenRecording = fakePermission('screen-recording', 'settings.dialogs.onboarding.permissions.screenRecordingTitle', 'denied')
    const screen = await renderPanel([screenRecording.permission])

    await expect.element(screen.getByRole('button', { name: 'Open System Settings' })).toBeInTheDocument()
  })

  it('checks again when the window gets focus, because the user changes a denial in the system settings', async () => {
    const microphone = fakePermission('microphone', 'settings.dialogs.onboarding.permissions.microphoneTitle', 'denied')
    const screen = await renderPanel([microphone.permission])
    await expect.element(screen.getByRole('button', { name: 'Open System Settings' })).toBeInTheDocument()

    microphone.setStatus('granted')
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new Event('focus'))

    await expect.poll(() => screen.getByRole('button').elements().length).toBe(0)
    await expect.element(screen.getByText('Granted')).toBeInTheDocument()
  })
})
