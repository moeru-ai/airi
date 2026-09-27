import { PiniaColada } from '@pinia/colada'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { createPinia } from 'pinia'
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import CardModelBinding from './card-model-binding.vue'

import 'virtual:uno.css'

it('changes only the displayed card binding and preserves inheritance', async () => {
  localStorage.clear()
  const pinia = createPinia()
  pinia.state.value = {
    'airi-card-catalog': {
      cards: new Map(['default', 'luna', 'sol'].map(id => [id, {
        name: id,
        version: '1.0.0',
        description: '',
        extensions: { airi: { agents: {}, modules: {
          consciousness: { provider: '', model: '' },
          speech: { provider: '', model: '', voice_id: '' },
          vision: { provider: '', model: '' },
        } } },
      }])),
    },
    'display-models': {
      displayModels: [
        { id: 'model-a', name: 'Model A', type: 'url', url: 'https://example.com/a.vrm', format: 'vrm', importedAt: 1 },
        { id: 'model-b', name: 'Model B', type: 'url', url: 'https://example.com/b.vrm', format: 'vrm', importedAt: 2 },
      ],
    },
  }
  const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })
  const screen = await render(CardModelBinding, {
    props: { cardId: 'luna' },
    global: { plugins: [pinia, PiniaColada, i18n] },
  })
  const cards = useAiriCardStore(pinia)

  await screen.getByRole('combobox').click()
  await screen.getByRole('option', { name: 'Model B' }).click()
  await expect.poll(() => cards.getCard('luna')?.extensions.airi.modules.displayModelId).toBe('model-b')
  expect(cards.getCard('sol')?.extensions.airi.modules.displayModelId).toBeUndefined()
  expect(cards.activeCardId).toBe('default')

  await screen.getByRole('combobox').click()
  await screen.getByRole('option', { name: 'settings.pages.card.creation.inherit_global_settings' }).click()
  await expect.poll(() => cards.getCard('luna')?.extensions.airi.modules.displayModelId).toBeUndefined()
  expect(cards.activeCardId).toBe('default')
})
