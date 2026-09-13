import type { Page } from 'playwright'

import { describe, expect, it } from '../../src'
import { configureModuleHearing, configureOnboarding } from '../shared/configurations'
import { enableHearingPlaygroundMicrophone, openHearingPlayground, readHearingPlaygroundTranscriptions } from '../shared/interactions'
import { appleSpeechAsr } from '../shared/providers'

// ROOT CAUSE:
//
// Chromium starts the non-looping fake microphone as soon as getUserMedia opens.
// Hearing requests microphone permission before the test starts monitoring, so a
// short fixture can finish before the Provider receives a speech segment. This
// fixture keeps 20 seconds of leading silence before the native transcription.
const input = new URL('../long-leading-silence/input.test.wav', import.meta.url)
const preflight = [
  configureOnboarding(() => ({ completed: true })),
  configureModuleHearing(async (context) => {
    const isMacOS = await context.runtime.runtimePage.evaluate(() => 'platform' in window && window.platform === 'darwin')
    context.skip(!isMacOS, 'Apple Speech requires macOS 26 or later.')
    if (!isMacOS)
      return undefined

    return {
      provider: appleSpeechAsr({ locale: 'en-US' }),
    }
  }),
]

async function waitForStoredLocale(page: Page, locale: string) {
  await page.waitForFunction((expectedLocale) => {
    const stored = localStorage.getItem('settings/providers/configured')
    if (!stored)
      return false
    const providers = JSON.parse(stored) as Record<string, { config?: { locale?: string } }>
    return providers['apple-speech-transcription']?.config?.locale === expectedLocale
  }, locale)
}

describe('Apple Speech audio input', () => {
  it('configures the native locale and transcribes through the Electron Provider', { input, preflight }, async ({ audio }) => {
    const page = await openHearingPlayground(audio)
    audio.activatePage(page)
    await page.getByTestId('hearing-playground-monitor-toggle').waitFor({ state: 'visible', timeout: 60_000 })
    const localeCombobox = page.getByTestId('apple-speech-locale').getByRole('combobox')
    try {
      await localeCombobox.waitFor({ state: 'visible', timeout: 10_000 })
    }
    catch (error) {
      const diagnostics = await page.evaluate(() => ({
        activeProvider: localStorage.getItem('settings/hearing/active-provider'),
        configuredProviders: localStorage.getItem('settings/providers/configured'),
        localeFieldCount: document.querySelectorAll('[data-testid="apple-speech-locale"]').length,
        localeTextVisible: document.body.textContent?.includes('Locale') ?? false,
      }))
      throw new Error(`Apple Speech locale field is unavailable: ${JSON.stringify(diagnostics)}`, { cause: error })
    }
    await localeCombobox.click()
    const localeOptions = await page.getByRole('option').allTextContents()
    expect(localeOptions.some(option => option.includes('en-US'))).toBe(true)

    const zhCNOption = page.getByRole('option').filter({ hasText: 'zh-CN' }).first()
    await zhCNOption.click()
    await waitForStoredLocale(page, 'zh-CN')
    await page.waitForFunction(() => {
      const input = document.querySelector<HTMLInputElement>('[data-testid="apple-speech-locale"] input')
      return input?.value === '中文（中国） (zh-CN)'
    })

    await localeCombobox.click()
    const enUSOption = page.getByRole('option').filter({ hasText: 'en-US' }).first()
    await enUSOption.click()
    await waitForStoredLocale(page, 'en-US')
    await page.waitForFunction(() => {
      const input = document.querySelector<HTMLInputElement>('[data-testid="apple-speech-locale"] input')
      return input?.value === 'American English (en-US)'
    })

    await enableHearingPlaygroundMicrophone(page)
    try {
      const transcriptions = await readHearingPlaygroundTranscriptions(page, 1)
      // The playground owns transcription in the settings renderer. The session
      // matcher observes the main renderer used by chat microphone cases.
      expect(transcriptions[0]).toContain('Just let go.')
    }
    catch (error) {
      const diagnostics = await page.evaluate(() => ({
        activeModel: localStorage.getItem('settings/hearing/active-model'),
        activeProvider: localStorage.getItem('settings/hearing/active-provider'),
        configuredProviders: localStorage.getItem('settings/providers/configured'),
        piniaActionEvents: window.__airiAudioInputE2E?.piniaActionEvents ?? [],
        probeInstalled: Boolean(window.__airiAudioInputE2E),
        streamingTranscriptionReady: window.__airiAudioInputE2E?.streamingTranscriptionReady ?? false,
        streamingTranscriptionUpdates: window.__airiAudioInputE2E?.streamingTranscriptionUpdates ?? [],
        vadReady: window.__airiAudioInputE2E?.vadReady ?? false,
      }))
      throw new Error(`Apple Speech did not produce a transcript: ${JSON.stringify(diagnostics)}`, { cause: error })
    }

    finally {
      await page.getByTestId('hearing-playground-monitor-toggle').click()
    }
  })
})
