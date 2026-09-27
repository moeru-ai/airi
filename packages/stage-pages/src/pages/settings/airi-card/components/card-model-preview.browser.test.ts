import { PiniaColada } from '@pinia/colada'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { createPinia } from 'pinia'
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import CardModelPreview from './card-model-preview.vue'

import 'virtual:uno.css'

it('shows bindings without changing the active character', async () => {
  localStorage.clear()
  const pinia = createPinia()
  pinia.state.value = {
    'airi-card-catalog': {
      cards: new Map(),
      moduleDefaults: {
        consciousness: { provider: '', model: '' },
        vision: { provider: '', model: '' },
        speech: { provider: '', model: '', voice_id: '' },
        displayModelId: 'global-model',
      },
    },
    'display-models': {
      displayModels: [
        { id: 'global-model', name: 'Global model', type: 'url', url: 'https://example.com/global.vrm', format: 'vrm', importedAt: 1 },
        { id: 'card-model', name: 'Card model', type: 'url', url: 'https://example.com/card.vrm', format: 'vrm', importedAt: 2 },
      ],
    },
  }
  const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })
  const screen = await render(CardModelPreview, {
    props: { modelId: 'card-model' },
    global: { plugins: [pinia, PiniaColada, i18n] },
  })
  const cards = useAiriCardStore(pinia)
  const activeCardId = cards.activeCardId

  await expect.element(screen.getByText('Card model', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('settings.pages.card.model-bound', { exact: true })).toBeVisible()
  await screen.rerender({ modelId: '' })
  await expect.element(screen.getByText('Global model', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('settings.pages.card.creation.inherit_global_settings', { exact: true })).toBeVisible()
  await screen.rerender({ modelId: 'deleted-model' })
  await expect.element(screen.getByText('settings.pages.card.model-unavailable', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('deleted-model', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('Global model', { exact: true })).not.toBeInTheDocument()
  expect(cards.activeCardId).toBe(activeCardId)
  expect(cards.moduleDefaults?.displayModelId).toBe('global-model')
})
