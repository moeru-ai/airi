import en from '@proj-airi/i18n/locales/en'

import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import CardEditor from './CardEditor.vue'

import 'virtual:uno.css'

describe('card editor message limit', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(async () => {
    localStorage.clear()
    pinia = createPinia()
    await page.viewport(1280, 900)
  })

  afterEach(() => {
    cleanup()
    disposePinia(pinia)
    localStorage.clear()
  })

  it('shows All for existing cards and saves a limit, zero, and All', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
    })
    await router.push('/settings/airi-card/new')
    const screen = await render(CardEditor, {
      props: { cardId: '', initialSection: 'settings' },
      global: {
        plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } }), router],
      },
    })
    const store = useAiriCardStore(pinia)
    const cardId = await store.addCard({ name: 'Luna', version: '1.0.0' }, 'scratch')
    await screen.rerender({ cardId, initialSection: 'settings' })

    const input = screen.getByRole('spinbutton', { name: 'Messages to remember' })
    await expect.element(input).toHaveValue(null)
    await expect.element(input).toHaveAttribute('placeholder', 'All')
    for (const [text, expected] of [['20', 20], ['0', 0], ['', -1]] as const) {
      await input.fill(text)
      await screen.getByRole('button', { name: 'Save changes', exact: true }).first().click()
      await expect.poll(() => store.getCard(cardId)?.extensions.airi.contextWindow).toBe(expected)
    }
  })
})
