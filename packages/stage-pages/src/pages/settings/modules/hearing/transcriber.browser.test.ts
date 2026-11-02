import en from '@proj-airi/i18n/locales/en'

import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import TranscriberPage from './transcriber.vue'

import 'virtual:uno.css'

const pinias: ReturnType<typeof createPinia>[] = []

afterEach(() => {
  cleanup()
  pinias.splice(0).forEach(pinia => disposePinia(pinia))
  vi.restoreAllMocks()
  localStorage.clear()
})

async function renderTranscriber() {
  const pinia = createPinia()
  pinias.push(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:path(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/settings/modules/hearing/transcriber')

  return render(TranscriberPage, {
    global: {
      plugins: [pinia, router, createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: false, fallbackWarn: false })],
    },
  })
}

describe('speech recognition settings', () => {
  // https://github.com/moeru-ai/airi/issues/3153
  // ROOT CAUSE:
  // Provider radio cards had no disabled choice. None now disables Hearing and retains the provider and model.
  it.each(['provider', 'switch'] as const)('issue #3153: disables recognition through the %s control without deleting the provider or model', async (control) => {
    localStorage.setItem('settings/hearing/active-provider', 'browser-web-speech-api')
    localStorage.setItem('settings/hearing/active-model', 'web-speech-api')
    const screen = await renderTranscriber()
    const hearing = useHearingStore(pinias[pinias.length - 1])

    expect(hearing.configured).toBe(true)
    const noneCard = screen.getByRole('radio', { name: 'None', exact: true }).element().closest('label')!
    const toggle = screen.getByRole('switch', { name: 'Hearing', exact: true })
    if (control === 'switch')
      await toggle.click()
    else
      await page.elementLocator(noneCard).click()
    expect(hearing.configured).toBe(false)
    expect(hearing.activeTranscriptionProvider).toBe('browser-web-speech-api')
    expect(hearing.activeTranscriptionModel).toBe('web-speech-api')
    await expect.element(screen.getByRole('radio', { name: 'None', exact: true })).toBeChecked()
    await expect.element(toggle).not.toBeChecked()
    await toggle.click()
    expect(hearing.configured).toBe(true)
    expect(hearing.activeTranscriptionModel).toBe('web-speech-api')
  })

  it('shows the microphone, the providers, and the playground without the overview controls', async () => {
    const screen = await renderTranscriber()

    await expect.element(screen.getByText('Input device')).toBeVisible()
    await expect.element(screen.getByTestId('hearing-playground-monitor-toggle')).toBeVisible()
    expect(screen.getByTestId('hearing-input-mode').query()).toBeNull()
    expect(screen.getByTestId('hearing-auto-send').query()).toBeNull()
  })

  it('does not open the microphone when the page opens', async () => {
    const capture = vi.spyOn(navigator.mediaDevices, 'getUserMedia')
    const screen = await renderTranscriber()

    await expect.element(screen.getByTestId('hearing-playground-monitor-toggle')).toBeVisible()
    expect(capture).not.toHaveBeenCalled()
  })
})
