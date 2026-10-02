import type { Locator } from 'playwright'

import type { AudioInputSession } from '../../../src/types'

import { captureStreamingTranscription } from './streaming-transcription'

export interface EnableChatMicrophoneOptions {
  /** @default 'vad' */
  readiness?: 'streaming-transcription' | 'vad'
}

/** Enables the chat microphone through the UI owned by the selected runtime. */
export async function enableChatMicrophone(
  runtime: AudioInputSession,
  options: EnableChatMicrophoneOptions = {},
): Promise<void> {
  if (runtime.target === 'electron') {
    const app = runtime.electronApp
    if (!app)
      throw new Error('The Electron audio session does not expose its application.')

    const existingChatPage = app.windows().find(page => page.url().includes('index.html#/chat'))
    if (existingChatPage) {
      runtime.activatePage(existingChatPage)
    }
    else {
      const chatButton = runtime.runtimePage.locator('button').filter({
        has: runtime.runtimePage.locator('[i-solar\\:chat-line-line-duotone]'),
      }).first()
      await chatButton.waitFor({ state: 'visible', timeout: 30_000 })
      runtime.activatePage(await openElectronChat(app, chatButton))
    }
  }

  const { page } = runtime
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 60_000 })
  await captureStreamingTranscription(page, 'textarea')

  if (runtime.target === 'electron') {
    await runtime.runtimePage.waitForFunction(async () => {
      const devices = await navigator.mediaDevices.enumerateDevices()
      return devices.some(device => device.kind === 'audioinput' && device.label.includes('Fake'))
    })

    const hearingTrigger = runtime.runtimePage.locator('div[aria-haspopup="dialog"] button').first()
    await hearingTrigger.waitFor({ state: 'visible', timeout: 15_000 })
    await hearingTrigger.hover()
    await hearingTrigger.click({ force: true })
    await runtime.runtimePage.waitForTimeout(500)

    const enableButton = runtime.runtimePage.locator('button[aria-label="Enable microphone input"]')
    await enableButton.waitFor({ state: 'visible', timeout: 15_000 })
    const inputReady = options.readiness === 'streaming-transcription'
      ? runtime.waitForStreamingTranscriptionReady()
      : runtime.waitForVadReady()
    await enableButton.click({ force: true })
    const disableButton = runtime.runtimePage.locator('button[aria-label="Disable microphone input"]')
    await disableButton.waitFor({ state: 'visible', timeout: 15_000 })
    await inputReady
    return
  }

  const microphoneTrigger = page.locator('button').filter({ has: page.locator('.i-ph\\:microphone-slash') }).first()
  await microphoneTrigger.click({ force: true })

  const enableButton = page.locator('button[aria-label="Enable microphone input"]')
  await enableButton.waitFor({ state: 'visible' })
  const inputReady = options.readiness === 'streaming-transcription'
    ? runtime.waitForStreamingTranscriptionReady()
    : runtime.waitForVadReady()
  await enableButton.click()
  await page.locator('button[aria-label="Disable microphone input"]').waitFor({ state: 'visible' })
  await inputReady
}

/** Opens the chat page and waits for its input. */
export async function openChat(runtime: AudioInputSession): Promise<void> {
  await runtime.page.evaluate(() => {
    window.location.hash = '/chat'
  })
  await runtime.page.locator('textarea').first().waitFor({ state: 'visible', timeout: 60_000 })
}

/** Returns the assistant messages on the current chat page. */
export function assistantMessages(runtime: AudioInputSession): Locator {
  return runtime.page.locator('[data-chat-message-role="assistant"] .markdown-content')
}

async function openElectronChat(
  app: NonNullable<AudioInputSession['electronApp']>,
  chatButton: Locator,
): Promise<AudioInputSession['page']> {
  let lastError: unknown
  for (let attempt = 0; attempt < 10; attempt++) {
    await chatButton.click({ force: true })
    try {
      return await waitForElectronPage(app, page => page.url().includes('index.html#/chat'), 3_000)
    }
    catch (error) {
      lastError = error
    }
  }

  throw lastError
}

async function waitForElectronPage(
  app: NonNullable<AudioInputSession['electronApp']>,
  predicate: (page: AudioInputSession['page']) => boolean,
  timeoutMs = 60_000,
): Promise<AudioInputSession['page']> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const page = app.windows().find(predicate)
    if (page) {
      await page.waitForLoadState('domcontentloaded')
      await page.bringToFront()
      await page.waitForTimeout(750)
      return page
    }

    await new Promise(resolveWait => setTimeout(resolveWait, 100))
  }

  throw new Error(`Timed out while waiting for the Electron chat window. Open pages: ${app.windows().map(page => page.url()).join(', ')}`)
}
