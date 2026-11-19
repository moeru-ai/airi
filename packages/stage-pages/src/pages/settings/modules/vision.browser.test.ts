import en from '@proj-airi/i18n/locales/en'

import { useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { createPinia, disposePinia } from 'pinia'
import { expect, it, onTestFinished } from 'vitest'
import { render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import VisionPage from './vision.vue'

import 'virtual:uno.css'

// https://github.com/moeru-ai/airi/issues/3153
// ROOT CAUSE:
// Provider cards lacked a disabled choice. None now remains available even without configured providers.
it.each(['provider', 'switch'] as const)('issue #3153: disables vision through the %s control even when the selected provider is unavailable', async (control) => {
  localStorage.clear()
  localStorage.setItem('settings/vision/active-provider', 'unavailable-vision')
  localStorage.setItem('settings/vision/active-model', 'saved-model')
  const pinia = createPinia()
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:path(.*)*', component: { template: '<div />' } }] })
  await router.push('/settings/modules/vision')
  const view = render(VisionPage, {
    global: { plugins: [pinia, router, createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  onTestFinished(() => {
    view.unmount()
    disposePinia(pinia)
    localStorage.clear()
  })

  const noneCard = view.getByRole('radio', { name: 'None', exact: true }).element().closest('label')!
  const toggle = view.getByRole('switch', { name: 'Vision', exact: true })
  if (control === 'switch')
    await toggle.click()
  else
    await page.elementLocator(noneCard).click()
  await expect.element(view.getByRole('radio', { name: 'None', exact: true })).toBeChecked()
  const vision = useVisionStore(pinia)
  expect(vision.enabled).toBe(false)
  expect(vision.configured).toBe(false)
  expect(vision.activeProvider).toBe('unavailable-vision')
  expect(vision.activeModel).toBe('saved-model')
  await expect.element(toggle).not.toBeChecked()
  await toggle.click()
  expect(vision.enabled).toBe(true)
  expect(vision.activeProvider).toBe('unavailable-vision')
  expect(vision.activeModel).toBe('saved-model')
})
