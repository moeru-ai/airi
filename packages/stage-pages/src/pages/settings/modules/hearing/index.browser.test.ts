import en from '@proj-airi/i18n/locales/en'
import zhHans from '@proj-airi/i18n/locales/zh-Hans'

import { pushToTalkTriggerKey } from '@proj-airi/stage-ui/composables/push-to-talk-trigger'
import { OFFICIAL_CHAT_PROVIDER_ID } from '@proj-airi/stage-ui/libs/providers/providers/official/constants'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
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

/**
 * Renders the Hearing overview in a host that declares whether it has a Push to Talk trigger. `undefined` provides nothing.
 * The page renders selects on a wide screen and row lists on a narrow one, so each test sets its width.
 */
async function renderHearing(trigger: boolean | undefined, width = 1280, { locale = 'en', messages = en }: { locale?: string, messages?: typeof en } = {}) {
  await page.viewport(width, 800)
  const pinia = createPinia()
  pinias.push(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:path(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/settings/modules/hearing')

  return render(HearingPage, {
    global: {
      plugins: [pinia, router, createI18n({ legacy: false, locale, messages: { [locale]: messages }, missingWarn: false, fallbackWarn: false })],
      provide: trigger === undefined ? {} : { [pushToTalkTriggerKey as symbol]: trigger },
    },
  })
}

async function openInputModeSelect(screen: Awaited<ReturnType<typeof renderHearing>>) {
  await screen.getByTestId('hearing-input-mode').getByRole('combobox').click()
  return screen.getByRole('option', { name: /Push to Talk/ })
}

describe('hearing overview', () => {
  // https://github.com/moeru-ai/airi/issues/3153
  // ROOT CAUSE:
  // The overview lacked a module switch. The switch now preserves the selected provider and model.
  it('issue #3153: switches hearing off and on without clearing its selection', async () => {
    localStorage.setItem('settings/hearing/active-provider', 'browser-web-speech-api')
    localStorage.setItem('settings/hearing/active-model', 'web-speech-api')
    const screen = await renderHearing(true)
    const hearing = useHearingStore(pinias[pinias.length - 1])
    const toggle = screen.getByRole('switch', { name: 'Hearing', exact: true })
    await expect.element(toggle).toBeChecked()
    await toggle.click()
    expect(hearing.configured).toBe(false)
    expect(hearing.activeTranscriptionProvider).toBe('browser-web-speech-api')
    expect(hearing.activeTranscriptionModel).toBe('web-speech-api')
    await toggle.click()
    expect(hearing.configured).toBe(true)
  })

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

describe('hearing transcript rewrite', () => {
  /**
   * @example
   * localStorage.setItem('settings/hearing/rephrase-provider', 'official-provider')
   */
  it.each([
    ['en', en, 'Transcript rewrite'],
    ['zh-Hans', zhHans, '语音改写'],
  ])('offers the official asr-rewrite alias as the rewrite model in %s', async (locale, messages, label) => {
    // The signed-in session requests account data. No test server answers it.
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({}))
    localStorage.setItem('settings/hearing/rephrase-provider', OFFICIAL_CHAT_PROVIDER_ID)
    const screen = await renderHearing(true, 1280, { locale, messages })
    const pinia = pinias[pinias.length - 1]
    const now = new Date()
    useAuthStore(pinia).$patch({
      token: 'access-token',
      user: { id: 'owner', name: 'Owner', email: 'owner@example.com', emailVerified: true, createdAt: now, updatedAt: now },
      session: { id: 'session', userId: 'owner', token: 'session-token', createdAt: now, updatedAt: now, expiresAt: new Date(now.getTime() + 60000) },
    })
    await useProviderConfigStore(pinia).ensureProvider(OFFICIAL_CHAT_PROVIDER_ID, OFFICIAL_CHAT_PROVIDER_ID, {})
    await useProviderStore(pinia).forceProviderConfigured(OFFICIAL_CHAT_PROVIDER_ID)
    await useProviderStore(pinia).fetchModelsForProvider(OFFICIAL_CHAT_PROVIDER_ID)

    const model = screen.getByTestId('hearing-rephrase-model').getByRole('combobox')
    await model.click()
    const option = screen.getByRole('option', { name: label })
    await expect.element(option).toBeVisible()
    await option.click()

    expect(useHearingStore(pinia).rephraseModel).toBe('asr-rewrite')
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
