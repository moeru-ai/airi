import en from '@proj-airi/i18n/locales/en'

import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { createPinia, disposePinia } from 'pinia'
import { expect, it, onTestFinished } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import ArtistryPage from './artistry.vue'

import 'virtual:uno.css'

// ROOT CAUSE:
// The card's click handler navigated before selection completed. Only the configuration button now navigates.
it('selects an artistry provider with its radio dot without opening its configuration', async () => {
  localStorage.clear()
  const pinia = createPinia()
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:path(.*)*', component: { template: '<div />' } }] })
  await router.push('/settings/modules/artistry')
  const view = render(ArtistryPage, {
    global: { plugins: [pinia, router, createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  onTestFinished(() => {
    view.unmount()
    disposePinia(pinia)
    localStorage.clear()
  })
  const radio = view.getByRole('radio', { name: /OpenAI GPT Image/ })
  const circle = radio.element().closest('label')!.querySelector('.radio-circle')!
  await page.elementLocator(circle).click()
  expect(router.currentRoute.value.path).toBe('/settings/modules/artistry')
  await expect.element(radio).toBeChecked()
  expect(useArtistryStore(pinia).globalProvider).toBe('openai-image')
  expect(useArtistryStore(pinia).activeProvider).toBe('openai-image')

  const none = view.getByRole('radio', { name: /^None/ })
  await page.elementLocator(none.element().closest('label')!).click()
  await expect.element(none).toBeChecked()
  expect(router.currentRoute.value.path).toBe('/settings/modules/artistry')

  radio.element().focus()
  await userEvent.keyboard(' ')
  await expect.element(radio).toBeChecked()
  expect(router.currentRoute.value.path).toBe('/settings/modules/artistry')

  await page.elementLocator(none.element().closest('label')!).click()
  await view.getByRole('button', { name: 'Configure OpenAI GPT Image' }).click()
  expect(router.currentRoute.value.path).toBe('/settings/providers/artistry/openai-image')
  expect(useArtistryStore(pinia).globalProvider).toBe('none')
})
