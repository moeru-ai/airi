import en from '@proj-airi/i18n/locales/en'

import { pushToTalkTriggerKey } from '@proj-airi/stage-ui/composables/push-to-talk-trigger'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import HearingPage from './index.vue'
import TranscriberPage from './transcriber.vue'

import 'virtual:uno.css'

const pinias: ReturnType<typeof createPinia>[] = []

afterEach(() => {
  cleanup()
  pinias.splice(0).forEach(pinia => disposePinia(pinia))
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

/**
 * Renders the Hearing overview in a host that declares whether it has a Push to Talk trigger. `undefined` provides nothing.
 * The page renders selects on a wide screen and row lists on a narrow one, so each test sets its width.
 */
async function renderHearing(trigger: boolean | undefined, width = 1280, pinia = createPinia()) {
  await page.viewport(width, 800)
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

async function renderTranscriber(pinia = createPinia()) {
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
  it('lists the input modes as rows on a narrow screen and disables Push to Talk without a trigger', async () => {
    const screen = await renderHearing(undefined, 390)

    const pushToTalk = screen.getByTestId('hearing-input-mode').getByRole('radio', { name: /Push to Talk/ })
    await expect.element(pushToTalk).toBeVisible()
    await expect.element(pushToTalk).toHaveAttribute('data-disabled')
    await expect.element(screen.getByTestId('hearing-input-mode').getByRole('radio', { name: /Always on/ })).toHaveAttribute('data-state', 'checked')
  })

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
    localStorage.setItem('settings/providers/configured', JSON.stringify({
      'openrouter-audio-transcription': {
        id: 'openrouter-audio-transcription',
        definitionId: 'openrouter-audio-transcription',
        config: { apiKey: 'test-key', baseUrl: 'https://openrouter.test/api/v1' },
        status: 'configured',
        configuredBy: 'user',
      },
      'comet-api-transcription': {
        id: 'comet-api-transcription',
        definitionId: 'comet-api-transcription',
        config: { apiKey: 'test-key', baseUrl: 'https://comet.test/v1' },
        status: 'configured',
        configuredBy: 'user',
      },
    }))
    const pinia = createPinia()
    await renderTranscriber(pinia)
    const hearingStore = useHearingStore(pinia)
    const providersStore = useProviderStore(pinia)
    const requests: Array<{ url: string, resolve: (response: Response) => void }> = []
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(input => new Promise((resolve) => {
      requests.push({
        url: String(input),
        resolve,
      })
    })))

    hearingStore.activeTranscriptionProvider = 'openrouter-audio-transcription'
    await vi.waitFor(() => expect(requests.some(request => request.url.includes('openrouter.test'))).toBe(true))
    hearingStore.activeTranscriptionProvider = 'comet-api-transcription'
    await vi.waitFor(() => expect(requests.some(request => request.url.includes('comet.test'))).toBe(true))

    requests.find(request => request.url.includes('comet.test'))?.resolve(Response.json({ data: [{ id: 'comet-model' }] }))
    await vi.waitFor(() => expect(providersStore.getModelsForProvider('comet-api-transcription').map(model => model.id)).toContain('comet-model'))
    requests.find(request => request.url.includes('openrouter.test'))?.resolve(Response.json({ data: [{ id: 'openrouter-model' }] }))
    await vi.waitFor(() => expect(providersStore.getModelsForProvider('openrouter-audio-transcription').map(model => model.id)).toContain('openrouter-model'))

    expect(hearingStore.activeTranscriptionModel).toBe('comet-model')
    expect(localStorage.getItem('settings/hearing/provider-model/browser-web-speech-api')).toBe('browser-model')
    expect(localStorage.getItem('settings/hearing/provider-model/openrouter-audio-transcription')).toBe('openrouter-model')
  })
})
