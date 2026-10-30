import type { MicrophonePermission } from '../../../composables/audio/audio-device'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'

import MicrophonePicker from './microphone-picker.vue'

import 'virtual:uno.css'

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        settings: { pages: { modules: { hearing: { sections: { section: { 'input-device': {
          'system-default': 'System default',
          'allow': 'Allow microphone access',
          'allow-description': 'AIRI lists your microphones after you allow access.',
          'allow-action': 'Allow',
          'blocked': 'The browser blocked the microphone',
          'blocked-description': 'Allow the microphone for this site in the browser site settings.',
          'retry': 'Try again',
          'missing': 'No microphone found.',
        } } } } } } },
      },
    },
  })
}

const DEVICES = [
  { label: 'Default - Built-in Microphone', value: 'default' },
  { label: 'USB Microphone', value: 'usb' },
]

async function renderPicker(props: {
  options?: { label: string, value: string }[]
  permission?: MicrophonePermission
  requestAccess?: () => Promise<boolean | void>
  width?: number
}) {
  await page.viewport(props.width ?? 390, 800)
  return render(MicrophonePicker, {
    props: {
      'label': 'Input device',
      'modelValue': 'default',
      'options': props.options ?? [],
      'permission': props.permission ?? 'prompt',
      'requestAccess': props.requestAccess ?? (async () => true),
      'onUpdate:modelValue': () => {},
    },
    global: { plugins: [createTestI18n()] },
  })
}

describe('microphone picker', () => {
  afterEach(cleanup)

  // ROOT CAUSE:
  //
  // Before the page has microphone access, the browser lists inputs without IDs, so the device select had no
  // options and no way to ask for access. On a phone, the select also opened a second floating layer inside the
  // Hearing drawer.
  //
  // We fixed this with a picker that asks for access in place, and lists devices as rows on a narrow screen.
  it('asks for access when the page has none', async () => {
    const requestAccess = vi.fn(async () => true)
    const screen = await renderPicker({ requestAccess })

    await screen.getByRole('button', { name: 'Allow' }).click()

    expect(requestAccess).toHaveBeenCalledOnce()
  })

  // Android WebView reports `prompt` after the system granted the microphone, so the mobile app showed Allow on each
  // visit. The mobile app now requests access when the picker opens.
  it('requests access without a click in the mobile app', async () => {
    vi.stubEnv('RUNTIME_ENVIRONMENT', 'capacitor')
    const requestAccess = vi.fn(async () => true)
    try {
      await renderPicker({ requestAccess })
    }
    finally {
      vi.unstubAllEnvs()
    }

    expect(requestAccess).toHaveBeenCalledOnce()
  })

  it('waits for a click in a browser', async () => {
    const requestAccess = vi.fn(async () => true)
    await renderPicker({ requestAccess })

    expect(requestAccess).not.toHaveBeenCalled()
  })

  it('explains a denied request in place', async () => {
    const screen = await renderPicker({ requestAccess: async () => false })

    await screen.getByRole('button', { name: 'Allow' }).click()

    await expect.element(screen.getByText('Allow the microphone for this site in the browser site settings.')).toBeVisible()
  })

  it('tells where to allow a blocked microphone, and can try again', async () => {
    const requestAccess = vi.fn(async () => false)
    const screen = await renderPicker({ permission: 'denied', requestAccess })

    await expect.element(screen.getByText('The browser blocked the microphone')).toBeVisible()
    await screen.getByRole('button', { name: 'Try again' }).click()

    expect(requestAccess).toHaveBeenCalledOnce()
  })

  it('says when access is granted but no microphone is connected', async () => {
    const screen = await renderPicker({ permission: 'granted' })

    await expect.element(screen.getByText('No microphone found.')).toBeVisible()
  })

  it('lists the microphones as rows on a narrow screen', async () => {
    const screen = await renderPicker({ options: DEVICES, permission: 'granted' })

    await expect.element(screen.getByRole('radio', { name: 'Default - Built-in Microphone' })).toHaveAttribute('data-state', 'checked')
    await expect.element(screen.getByRole('radio', { name: 'USB Microphone' })).toBeVisible()
  })

  it('keeps a select on a wide screen', async () => {
    const screen = await renderPicker({ options: DEVICES, permission: 'granted', width: 1280 })

    await expect.element(screen.getByRole('combobox')).toBeVisible()
    await expect.element(screen.getByTestId('microphone-picker')).toHaveAttribute('data-layout', 'select')
  })
})
