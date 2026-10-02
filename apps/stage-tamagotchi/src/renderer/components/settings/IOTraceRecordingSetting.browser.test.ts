import en from '@proj-airi/i18n/locales/en'

import { configureIOTraceRecordingController } from '@proj-airi/stage-ui/composables/io-trace-recording'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import IOTraceRecordingSetting from './IOTraceRecordingSetting.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

afterEach(async () => {
  cleanup()
  await configureIOTraceRecordingController(undefined)
})

describe('iO trace recording setting', () => {
  it('renders the recording contract and changes the shared main-owned switch', async () => {
    const setEnabled = vi.fn(async (enabled: boolean) => ({ capturesDirectory: '/tmp/traces', enabled }))
    await configureIOTraceRecordingController({
      getSpans: async () => [],
      getState: async () => ({ capturesDirectory: '/tmp/traces', enabled: false }),
      onStateChange: () => () => {},
      setEnabled,
    })
    const screen = await render(IOTraceRecordingSetting, {
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })

    await expect.element(screen.getByText('Record IO traces automatically')).toBeVisible()
    await expect.element(screen.getByText(/save ended spans locally for CLI analysis/)).toBeVisible()
    await screen.getByText('Record IO traces automatically').click()

    await expect.poll(() => setEnabled.mock.calls).toEqual([[true]])
    expect(screen.container.querySelector('input[type="checkbox"]')?.getAttribute('aria-checked')).toBe('true')
  })
})
