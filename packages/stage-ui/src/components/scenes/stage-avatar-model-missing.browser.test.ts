import en from '@proj-airi/i18n/locales/en'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import StageAvatarModelMissing from './stage-avatar-model-missing.vue'

afterEach(() => {
  cleanup()
})

describe('stage avatar model missing', () => {
  it('names the card and asks the app to open the model settings', async () => {
    const onSelect = vi.fn()
    const screen = render(StageAvatarModelMissing, {
      props: { name: 'Legacy Free', onSelect },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: false, fallbackWarn: false })],
      },
    })

    await expect.element(screen.getByText('Legacy Free has no model')).toBeVisible()
    await screen.getByRole('button', { name: 'Select model' }).click()

    expect(onSelect).toHaveBeenCalledOnce()
  })
})
