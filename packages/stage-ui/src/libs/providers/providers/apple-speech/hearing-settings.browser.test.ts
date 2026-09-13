import en from '@proj-airi/i18n/locales/en'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { computed, shallowRef } from 'vue'
import { createI18n } from 'vue-i18n'

import HearingSettings from './hearing-settings.vue'

import { hearingProviderViewContextKey } from '../../hearing-view'
import { listAppleSpeechLocaleOptions } from './provider'

// The native locale inventory is an IPC boundary. Keep the view and its inputs real.
vi.mock('./provider', () => ({ listAppleSpeechLocaleOptions: vi.fn() }))

describe('apple Speech hearing settings', () => {
  afterEach(() => vi.resetAllMocks())

  it('shows the locale label after native options load and configuration changes', async () => {
    // ROOT CAUSE:
    //
    // The input resolves its label before the native locale inventory arrives.
    // Reka resets the input for model changes, but not for newly loaded options.
    // The placeholder can remain visible as the input value after loading.
    const options = [
      { label: 'American English (en-US)', value: 'en-US' },
      { label: '中文（中国） (zh-CN)', value: 'zh-CN' },
    ]
    let finishLoading!: (value: typeof options) => void
    vi.mocked(listAppleSpeechLocaleOptions).mockImplementationOnce(() => new Promise((resolve) => {
      finishLoading = resolve
    })).mockResolvedValue(options)
    const config = shallowRef({ locale: 'zh-CN' })
    const screen = await render(HearingSettings, {
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
        provide: {
          [hearingProviderViewContextKey as symbol]: {
            providerConfig: computed(() => config.value),
            updateProviderConfig: async (patch: { locale: string }) => { config.value = patch },
          },
        },
      },
    })

    finishLoading(options)
    const input = screen.getByRole('combobox')
    await expect.element(input).toHaveValue('中文（中国） (zh-CN)')
    config.value = { locale: 'en-US' }
    await expect.element(input).toHaveValue('American English (en-US)')
    await input.click()
    await screen.getByRole('option', { name: '中文（中国） (zh-CN)' }).click()
    await expect.poll(() => config.value.locale).toBe('zh-CN')
    await expect.element(input).toHaveValue('中文（中国） (zh-CN)')
  })
})
