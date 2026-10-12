import en from '@proj-airi/i18n/locales/en'

import { pushToTalkTriggerKey } from '@proj-airi/stage-ui/composables/push-to-talk-trigger'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import HearingPage from './index.vue'

import 'virtual:uno.css'

const pinias: ReturnType<typeof createPinia>[] = []

afterEach(() => {
  cleanup()
  pinias.splice(0).forEach(pinia => disposePinia(pinia))
  vi.restoreAllMocks()
  localStorage.clear()
})

/** Renders the Hearing overview in a host that declares whether it has a Push to Talk trigger. `undefined` provides nothing. */
async function renderHearing(trigger: boolean | undefined, pinia = createPinia()) {
  pinias.push(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:path(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/settings/modules/hearing')

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

describe('hearing overview', () => {
  it('links to the speech recognition and wake words pages', async () => {
    const screen = await renderHearing(true)

    await expect.element(screen.getByTestId('hearing-page-transcriber').getByRole('link')).toHaveAttribute('href', '/settings/modules/hearing/transcriber')
    await expect.element(screen.getByTestId('hearing-page-transcriber')).toHaveTextContent('Speech recognition')
    await expect.element(screen.getByTestId('hearing-page-wake-words').getByRole('link')).toHaveAttribute('href', '/settings/modules/hearing/wake-words')
    await expect.element(screen.getByTestId('hearing-page-wake-words')).toHaveTextContent('Wake words')
  })

  it('does not open the microphone when the page opens', async () => {
    const capture = vi.spyOn(navigator.mediaDevices, 'getUserMedia')
    const screen = await renderHearing(true)

    await expect.element(screen.getByTestId('hearing-microphone-switch')).toBeVisible()
    await expect.element(screen.getByTestId('hearing-auto-send')).toBeVisible()
    expect(capture).not.toHaveBeenCalled()
  })

  it('shows the wake word status when the input mode is wake words', async () => {
    localStorage.setItem('settings/hearing/input-mode', 'wake-word')
    const screen = await renderHearing(true)

    await expect.element(screen.getByTestId('hearing-wake-word-status')).toHaveTextContent('No character has wake words.')
  })
})

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

describe('hearing provider changes', () => {
  it('keeps the latest provider model when earlier model requests finish later', async () => {
    localStorage.setItem('settings/hearing/active-provider', 'browser-web-speech-api')
    localStorage.setItem('settings/hearing/active-model', 'browser-model')
    localStorage.setItem('settings/hearing/active-custom-model', 'browser-model')
    localStorage.setItem('settings/hearing/provider-model/openrouter-audio-transcription', 'openrouter-model')
    localStorage.setItem('settings/hearing/provider-model/comet-api-transcription', 'comet-model')
    const pinia = createPinia()
    await renderHearing(undefined, pinia)
    const hearingStore = useHearingStore(pinia)
    const requests: Array<{ provider: string, resolve: () => void }> = []
    vi.spyOn(hearingStore, 'loadModelsForProvider').mockImplementation(provider => new Promise((resolve) => {
      requests.push({ provider, resolve })
    }))

    hearingStore.activeTranscriptionProvider = 'openrouter-audio-transcription'
    await vi.waitFor(() => expect(requests.some(request => request.provider === 'openrouter-audio-transcription')).toBe(true))
    hearingStore.activeTranscriptionProvider = 'comet-api-transcription'
    await vi.waitFor(() => expect(requests.some(request => request.provider === 'comet-api-transcription')).toBe(true))

    requests.forEach(request => request.resolve())

    await vi.waitFor(() => expect(hearingStore.activeTranscriptionModel).toBe('comet-model'))
    expect(hearingStore.getSavedProviderModel('browser-web-speech-api')).toBe('browser-model')
    expect(hearingStore.getSavedProviderModel('openrouter-audio-transcription')).toBe('openrouter-model')
  })
})
