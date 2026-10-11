import en from '@proj-airi/i18n/locales/en'

import { pushToTalkTriggerKey } from '@proj-airi/stage-ui/composables/push-to-talk-trigger'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import HearingPage from './hearing.vue'

import 'virtual:uno.css'

const pinias: ReturnType<typeof createPinia>[] = []

afterEach(() => {
  cleanup()
  pinias.splice(0).forEach(pinia => disposePinia(pinia))
  localStorage.clear()
})

/** Renders the Hearing page in a host that declares whether it has a Push to Talk trigger. `undefined` provides nothing. */
async function renderHearing(trigger: boolean | undefined) {
  const pinia = createPinia()
  pinias.push(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }],
  })
  await router.push('/')

  return render(HearingPage, {
    global: {
      plugins: [pinia, router, createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: false, fallbackWarn: false })],
      provide: trigger === undefined ? {} : { [pushToTalkTriggerKey as symbol]: trigger },
    },
  })
}

async function openInputModeSelect(screen: Awaited<ReturnType<typeof renderHearing>>) {
  await screen.getByTestId('hearing-input-mode').getByRole('combobox').click()
  return screen.getByRole('option', { name: /Push to Talk/ })
}

describe('hearing input mode', () => {
  // Review: https://github.com/moeru-ai/airi/pull/2729#discussion_r4237157722
  it('disables Push to Talk with a hint when the host declares no trigger', async () => {
    const screen = await renderHearing(undefined)

    const option = await openInputModeSelect(screen)

    await expect.element(option).toHaveAttribute('data-disabled')
    await expect.element(option).toHaveTextContent('Not available here. This app has no Push to Talk key on this device.')
  })

  it('offers Push to Talk when the host has a trigger', async () => {
    const screen = await renderHearing(true)

    const option = await openInputModeSelect(screen)

    await expect.element(option).not.toHaveAttribute('data-disabled')
    await expect.element(option).toHaveTextContent('AIRI listens only while you hold the Push to Talk key.')
  })

  it('warns when the saved mode is Push to Talk and the host has no trigger', async () => {
    localStorage.setItem('settings/hearing/input-mode', 'push-to-talk')
    const screen = await renderHearing(false)

    await expect.element(screen.getByTestId('hearing-input-mode-stranded')).toBeVisible()
    await expect.element(screen.getByTestId('hearing-input-mode-stranded')).toHaveTextContent('Push to Talk is not available here')
  })

  it('shows no warning for a saved Push to Talk mode when the host has a trigger', async () => {
    localStorage.setItem('settings/hearing/input-mode', 'push-to-talk')
    const screen = await renderHearing(true)

    await expect.element(screen.getByTestId('hearing-input-mode')).toBeVisible()
    expect(screen.getByTestId('hearing-input-mode-stranded').query()).toBeNull()
  })
})
