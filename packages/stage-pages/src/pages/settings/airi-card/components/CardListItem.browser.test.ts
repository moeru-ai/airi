import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import CardListItem from './CardListItem.vue'

import 'virtual:uno.css'

const props = {
  id: 'luna',
  name: 'Luna',
  description: 'A stargazer',
  isActive: false,
  version: '1.0.0',
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/settings/airi-card/:cardId', component: { template: '<div />' } },
    ],
  })
}

describe('card list item', () => {
  it('opens the character profile without exposing editing controls or activating the character', async () => {
    localStorage.clear()
    const pinia = createPinia()
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
    const router = createTestRouter()
    await router.push('/')
    const screen = await render(CardListItem, {
      props,
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

  it.each([
    ['synced', 'Synced to your account'],
    ['pending', 'Waiting to upload'],
    ['refused', 'Not uploaded. Your account has no room for more characters, so this character stays on this device.'],
  ] as const)('shows the %s state with its text', async (state, text) => {
    localStorage.clear()
    const pinia = createPinia()
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
    const router = createTestRouter()
    await router.push('/')
    const screen = await render(CardListItem, {
      props: { ...props, syncState: state },
      global: { plugins: [pinia, PiniaColada, i18n, router] },
    })

    const icon = screen.container.querySelector(`[data-sync-state="${state}"]`)
    expect(icon).not.toBeNull()
    expect(icon?.getAttribute('title')).toBe(text)
  })

  // Without an account nothing leaves the device, so the card shows no cloud state.
  it('shows no cloud state when the user is not signed in', async () => {
    localStorage.clear()
    const pinia = createPinia()
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
    const router = createTestRouter()
    await router.push('/')
    const screen = await render(CardListItem, {
      props,
      global: { plugins: [pinia, PiniaColada, i18n, router] },
    })

    expect(screen.container.querySelector('[data-sync-state]')).toBeNull()
  })
})
