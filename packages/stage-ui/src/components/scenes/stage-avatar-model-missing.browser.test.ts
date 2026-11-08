import en from '@proj-airi/i18n/locales/en'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import StageAvatarModelMissing from './stage-avatar-model-missing.vue'

afterEach(() => {
  cleanup()
})

describe('stage avatar model missing', () => {
  const i18n = () => createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: false, fallbackWarn: false })

  // The title named the card and the description named it again. A card named
  // "No Model" then read "No Model has no model". Only the description names it now.
  it('asks for a model when the card has none and opens the model settings', async () => {
    const onSelect = vi.fn()
    const screen = render(StageAvatarModelMissing, {
      props: { reason: 'missing', name: 'Legacy Free', onSelect },
      global: { plugins: [i18n()] },
    })

    await expect.element(screen.getByText('No model selected')).toBeVisible()
    await expect.element(screen.getByText('Select a model to show Legacy Free on the Stage.')).toBeVisible()
    await screen.getByRole('button', { name: 'Select model' }).click()

    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('says that this device cannot load the model of the card', async () => {
    const screen = render(StageAvatarModelMissing, {
      props: { reason: 'unavailable', name: 'Legacy Free' },
      global: { plugins: [i18n()] },
    })

    await expect.element(screen.getByText('This model is not on this device')).toBeVisible()
  })
})
