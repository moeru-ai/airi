import type { AiriCard } from '../../types/airiCard'

import { PiniaColada } from '@pinia/colada'
import { createPinia } from 'pinia'
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import CharacterSwitcherDrawer from './character-switcher-drawer.vue'

import { useAiriCardStore } from '../../stores/modules/airi-card'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

function card(name: string): AiriCard {
  return {
    name,
    version: '1.0.0',
    extensions: {
      airi: {
        agents: {},
        modules: {
          consciousness: { provider: '', model: '' },
          speech: { provider: '', model: '', voice_id: '' },
          vision: { provider: '', model: '' },
        },
      },
    },
  }
}

async function mountSwitcher(name = 'ReLU') {
  const pinia = createPinia()
  pinia.state.value['airi-card'] = {
    cards: new Map([['default', card(name)], ['second', card('Hiyori')]]),
    activeCardId: 'default',
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }, { path: '/settings/airi-card', component: { template: '<div />' } }],
  })
  await router.push('/')
  const screen = await render(defineComponent({
    components: { CharacterSwitcherDrawer },
    setup() {
      void useAiriCardStore().initialize()
    },
    template: '<header style="display:flex;width:100%"><span style="width:44px;flex-shrink:0" /><CharacterSwitcherDrawer /><span style="width:44px;flex-shrink:0" /></header>',
  }), {
    global: {
      plugins: [pinia, PiniaColada, router, createI18n({
        legacy: false,
        locale: 'en',
        missingWarn: false,
        fallbackWarn: false,
        messages: { en: { stage: { 'character-switcher': { title: 'Switch character', manage: 'Manage characters', empty: 'No characters yet', failed: 'Could not switch characters' } } } },
      })],
    },
  })
  return { screen, router, store: useAiriCardStore(pinia) }
}

it('selects a character through the real store and opens character management', async () => {
  await page.viewport(390, 844)
  const { screen, store, router } = await mountSwitcher()
  await screen.getByTestId('character-selector-button').click()
  await expect.poll(() => page.getByRole('dialog').element().getBoundingClientRect().height).toBeGreaterThanOrEqual(422)
  await expect.element(page.getByRole('button', { name: 'ReLU', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(document.querySelector('[data-vaul-handle]')).not.toBeNull()
  await page.getByRole('button', { name: 'Hiyori', exact: true }).click()
  await expect.poll(() => store.activeCardId).toBe('second')
  await expect.element(screen.getByTestId('character-selector-button')).toHaveTextContent('Hiyori')
  await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
  await screen.getByTestId('character-selector-button').click()
  await page.getByRole('button', { name: 'Manage characters' }).click()
  await expect.poll(() => router.currentRoute.value.path).toBe('/settings/airi-card')
})

it('truncates long titles and restores trigger focus on dismissal', async () => {
  await page.viewport(320, 640)
  const { screen, store } = await mountSwitcher('A very long character name that must not move the settings button')
  const trigger = screen.getByTestId('character-selector-button')
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
  expect(trigger.element().getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  await trigger.click()
  await userEvent.keyboard('{Escape}')
  await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
  await expect.element(trigger).toHaveFocus()
  expect(store.activeCardId).toBe('default')
})
