import type { AudioCapture } from '@proj-airi/vitest-plugin-fakemic'
import type { ElectronApplication, Page } from 'playwright'

import type { AudioInputSession, AudioInputTarget } from '../types'

import { Buffer } from 'node:buffer'

import { readCompletedSpans } from './browser-probe'

/** Creates the runtime session and records its page diagnostics. */
export function createSession(options: {
  electronApp?: ElectronApplication
  page: Page
  target: AudioInputTarget
  close: () => Promise<void>
  transcriptionCaptureFormat?: AudioCapture['format']
}): AudioInputSession {
  const diagnostics: string[] = []
  const observedPages = new WeakSet<Page>()

  function observePage(page: Page) {
    if (observedPages.has(page))
      return

    observedPages.add(page)
    page.on('console', (message) => {
      const text = message.text()
      const isAudioPipelineInfo = message.type() === 'info'
        && (text.includes('[Hearing Pipeline]') || text.includes('[Voice Input]') || text.includes('transcription'))
      if (['error', 'warning'].includes(message.type()) || isAudioPipelineInfo)
        diagnostics.push(`[console:${message.type()}] ${text}`)
    })
    page.on('pageerror', error => diagnostics.push(`[pageerror] ${error.message}`))
  }

  observePage(options.page)

  const session: AudioInputSession = {
    electronApp: options.electronApp,
    page: options.page,
    runtimePage: options.page,
    target: options.target,
    transcriptionCaptureFormat: options.transcriptionCaptureFormat,
    activatePage(page) {
      observePage(page)
      session.page = page
    },
    async capturedTranscriptionAudio(count) {
      try {
        await options.page.waitForFunction(expectedCount => (
          (window.__airiAudioInputE2E?.transcriptionAudio.length ?? 0) >= expectedCount
        ), count, { timeout: 60_000 })
      }
      catch (error) {
        const runtimeState = await options.page.evaluate(async () => ({
          activeModel: localStorage.getItem('settings/hearing/active-model'),
          activeProvider: localStorage.getItem('settings/hearing/active-provider'),
          devices: (await navigator.mediaDevices.enumerateDevices()).map(device => ({
            deviceId: device.deviceId,
            kind: device.kind,
            label: device.label,
          })),
          microphoneEnabled: localStorage.getItem('settings/audio/input/enabled'),
          microphoneInput: localStorage.getItem('settings/audio/input'),
          microphoneOffIconVisible: Boolean(document.querySelector('[i-ph\\:microphone-slash]')),
          probeInstalled: Boolean(window.__airiAudioInputE2E),
          streamingTranscriptionReady: window.__airiAudioInputE2E?.streamingTranscriptionReady ?? false,
          url: window.location.href,
          vadReady: window.__airiAudioInputE2E?.vadReady ?? false,
        }))
        throw new Error(`Timed out waiting for captured transcription audio: ${JSON.stringify({ diagnostics, runtimeState })}`, { cause: error })
      }
      const capturedAudio = await options.page.evaluate(() => window.__airiAudioInputE2E?.transcriptionAudio ?? [])
      return capturedAudio.map(audio => ({
        format: audio.format,
        data: Buffer.from(audio.base64, 'base64'),
      }))
    },
    streamingTranscriptionUpdates: () => session.page.evaluate(() => window.__airiAudioInputE2E?.streamingTranscriptionUpdates ?? []),
    async transcriptionResults(count) {
      await options.page.waitForFunction(expectedCount => (
        (window.__airiAudioInputE2E?.transcriptionResults.length ?? 0) >= expectedCount
      ), count, { timeout: 60_000 })
      return options.page.evaluate(() => window.__airiAudioInputE2E?.transcriptionResults ?? [])
    },
    async completedSpans(name) {
      const runtimeSpans = await options.page.evaluate(readCompletedSpans, name)
      if (session.page === options.page)
        return runtimeSpans

      const interactionSpans = await session.page.evaluate(readCompletedSpans, name)
      return [...runtimeSpans, ...interactionSpans]
    },
    async waitForVadReady() {
      await options.page.waitForFunction(() => window.__airiAudioInputE2E?.vadReady === true, undefined, { timeout: 30_000 })
    },
    async waitForStreamingTranscriptionReady() {
      await options.page.waitForFunction(() => window.__airiAudioInputE2E?.streamingTranscriptionReady === true, undefined, { timeout: 30_000 })
    },
    async snapshot() {
      const runtimeState = await options.page.evaluate(() => window.__airiAudioInputE2E)
      const interactionState = session.page === options.page
        ? runtimeState
        : await session.page.evaluate(() => window.__airiAudioInputE2E)
      return {
        spans: runtimeState?.spans ?? [],
        streamingTranscriptionUpdates: interactionState?.streamingTranscriptionUpdates ?? [],
        transcriptionResults: runtimeState?.transcriptionResults ?? [],
        diagnostics: [...diagnostics],
      }
    },
    close: options.close,
  }

  return session
}
