import type { HearingProviderViewContext } from '../../hearing-view'

import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { computed, shallowRef } from 'vue'
import { createI18n } from 'vue-i18n'

import HearingSettings from './hearing-settings.vue'

import { hearingProviderViewContextKey } from '../../hearing-view'

it('saves a distinct model ID when switching between the two Chinese/English models', async () => {
  const config = shallowRef({ model: 'paraformer-zh-en' })
  const updateProviderConfig = vi.fn<HearingProviderViewContext['updateProviderConfig']>(async (patch) => {
    config.value = { ...config.value, ...patch }
  })
  await render(HearingSettings, {
    global: {
      plugins: [createI18n({
        legacy: false,
        locale: 'en',
        missingWarn: false,
        fallbackWarn: false,
        messages: { en: {} },
      })],
      provide: {
        [hearingProviderViewContextKey]: {
          providerConfig: computed(() => config.value),
          updateProviderConfig,
        } satisfies HearingProviderViewContext,
      },
    },
  })

  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'settings.pages.providers.provider.sherpaw-transcription.model.zipformer-zh-en', exact: true }).click()
  await expect.poll(() => config.value.model).toBe('zipformer-zh-en')
  expect(updateProviderConfig).toHaveBeenCalledExactlyOnceWith({ model: 'zipformer-zh-en' })

  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'settings.pages.providers.provider.sherpaw-transcription.model.zipformer-multilingual', exact: true }).click()
  await expect.poll(() => config.value.model).toBe('zipformer-multilingual')
  expect(updateProviderConfig).toHaveBeenLastCalledWith({ model: 'zipformer-multilingual' })
})
