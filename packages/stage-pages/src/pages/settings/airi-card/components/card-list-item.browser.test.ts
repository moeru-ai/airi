import { PiniaColada } from '@pinia/colada'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { createPinia } from 'pinia'
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import CardListItem from './CardListItem.vue'

import 'virtual:uno.css'

it('opens the character profile without exposing editing controls or activating the character', async () => {
  localStorage.clear()
  const pinia = createPinia()
  const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/settings/airi-card/:cardId', component: { template: '<div />' } },
    ],
  })
  await router.push('/')
  const screen = await render(CardListItem, {
    props: { id: 'luna', name: 'Luna', description: 'A stargazer', isActive: false, version: '1.0' },
    global: { plugins: [pinia, PiniaColada, i18n, router] },
  })
  const cards = useAiriCardStore(pinia)
  const activeCardId = cards.activeCardId
  await expect.element(screen.getByRole('heading', { name: 'Luna' })).toBeVisible()
  await expect.element(screen.getByRole('combobox')).not.toBeInTheDocument()
  await expect.element(screen.getByRole('button')).not.toBeInTheDocument()
  await screen.getByRole('link').click()
  await expect.poll(() => router.currentRoute.value.path).toBe('/settings/airi-card/luna')
  expect(cards.activeCardId).toBe(activeCardId)
})
