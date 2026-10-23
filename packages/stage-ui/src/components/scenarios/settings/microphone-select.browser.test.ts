import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import MicrophoneSelect from './microphone-select.vue'

import 'virtual:uno.css'

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        settings: { pages: { modules: { hearing: { sections: { section: { 'input-device': {
          'allow': 'Allow microphone access',
          'allow-description': 'The browser lists microphones after you allow access.',
          'allow-denied': 'The browser blocked microphone access.',
        } } } } } } },
      },
    },
  })
}

function renderSelect(props: { options: { label: string, value: string }[], requestAccess: () => Promise<boolean | void> }) {
  return render(MicrophoneSelect, {
    props: { label: 'Input device', modelValue: '', ...props },
    global: { plugins: [createTestI18n()] },
  })
}

describe('microphone select', () => {
  afterEach(cleanup)

  // ROOT CAUSE:
  //
  // Before the page has microphone access, the browser lists inputs without IDs, so the select had no options.
  // Only the playground start button asked for access, so the select gave no way to get a device list.
  //
  // We fixed this by showing an access request below an empty select.
  it('requests access when the browser lists no microphone', async () => {
    const requestAccess = vi.fn(async () => true)
    const screen = renderSelect({ options: [], requestAccess })

    await screen.getByRole('button', { name: 'Allow microphone access' }).click()

    expect(requestAccess).toHaveBeenCalledOnce()
  })

  it('explains a denied request', async () => {
    const screen = renderSelect({ options: [], requestAccess: async () => false })

    await screen.getByRole('button', { name: 'Allow microphone access' }).click()

    await expect.element(screen.getByText('The browser blocked microphone access.')).toBeVisible()
  })

  it('shows no access request when microphones are listed', async () => {
    const screen = renderSelect({ options: [{ label: 'Built-in Microphone', value: 'built-in' }], requestAccess: async () => true })

    await expect.element(screen.getByTestId('microphone-select-access')).not.toBeInTheDocument()
  })
})
