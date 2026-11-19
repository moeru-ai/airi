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

    const existingChatPage = app.windows().find(page => page.url().includes('#/chat'))
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

  if (runtime.target === 'web') {
    // The startup screen covers the page until its exit animation ends.
    // A click before that point lands on the startup screen and does not open the microphone menu.
    await runtime.page.locator('.startup-screen').waitFor({ state: 'detached', timeout: 60_000 })
  }

  const { page } = runtime
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 60_000 })
  await captureStreamingTranscription(page, 'textarea')

  if (runtime.target === 'electron') {
    await runtime.runtimePage.waitForFunction(async () => {
      const devices = await navigator.mediaDevices.enumerateDevices()
      return devices.some(device => device.kind === 'audioinput' && device.label.includes('Fake'))
    })

    // The controls island has its own microphone switch. Its `aria-pressed` follows the microphone preference.
    const microphoneSwitch = runtime.runtimePage.locator('[data-testid="controls-island-microphone"]')
    await microphoneSwitch.waitFor({ state: 'visible', timeout: 15_000 })
    const inputReady = options.readiness === 'streaming-transcription'
      ? runtime.waitForStreamingTranscriptionReady()
      : undefined
    if (await microphoneSwitch.getAttribute('aria-pressed') !== 'true')
      await microphoneSwitch.click({ force: true })
    await runtime.runtimePage.locator('[data-testid="controls-island-microphone"][aria-pressed="true"]').waitFor({ state: 'visible', timeout: 15_000 })
    await inputReady
    return
  }

  // The Web composer has no listening switch. Its microphone menu opens the Hearing settings, which hold the Listen switch.
  // The router keeps the document, so the browser probe and the transcription capture stay on the page.
  await page.getByRole('button', { name: /^(?:Dictation|Walkie-talkie|Voice message)$/ }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'More Hearing settings…' }).click()

  const listenSwitch = page.getByRole('switch', { name: /^Listen/ })
  await listenSwitch.waitFor({ state: 'visible', timeout: 15_000 })
  const inputReady = options.readiness === 'streaming-transcription'
    ? runtime.waitForStreamingTranscriptionReady()
    : undefined
  if (!await listenSwitch.isChecked())
    await listenSwitch.click()
  await page.getByRole('switch', { name: /^Listen/, checked: true }).waitFor({ state: 'visible', timeout: 15_000 })

  // The stage page owns the voice host, so listening starts after the user returns to it.
  await page.goBack()
  await page.locator('textarea').first().waitFor({ state: 'visible', timeout: 60_000 })
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
      return await waitForElectronPage(app, page => page.url().includes('#/chat'), 3_000)
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
