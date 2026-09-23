import type { ElectronApplication, Page } from 'playwright'

import type { AudioInputSession } from '../../../src/types'

import { captureStreamingTranscription } from './streaming-transcription'

/** Opens the Electron hearing playground for a case that selects this input UI. */
export async function openHearingPlayground(runtime: AudioInputSession): Promise<Page> {
  const app = runtime.electronApp
  if (!app)
    throw new Error('The hearing playground interaction requires an Electron runtime')

  const settingsButton = runtime.page.getByRole('button', { name: /Open settings|打开设置/ }).last()
  if (!await settingsButton.isVisible().catch(() => false)) {
    await runtime.page.getByRole('button', { name: /Expand|展开/ }).last().click({ force: true })
    await settingsButton.waitFor({ state: 'visible', timeout: 15_000 })
  }

  await settingsButton.click({ force: true })
  const settingsPage = await waitForElectronPage(app, page => page.url().includes('index.html#/settings'))
  await settingsPage.evaluate(() => {
    window.location.hash = '/settings/modules/hearing'
  })
  await settingsPage.waitForURL(/#\/settings\/modules\/hearing/)
  await settingsPage.getByTestId('hearing-playground-monitor-toggle').waitFor({ state: 'visible', timeout: 60_000 })
  return settingsPage
}

/** Enables microphone monitoring on an open hearing playground. */
export async function enableHearingPlaygroundMicrophone(page: Page): Promise<void> {
  await captureStreamingTranscription(page, '[data-testid="hearing-playground-current"] p')

  const modelBasedToggle = page.getByRole('switch').last()
  if (await modelBasedToggle.isChecked())
    await modelBasedToggle.click()

  const monitorToggle = page.getByTestId('hearing-playground-monitor-toggle')
  await monitorToggle.click()
}

/** Reads the requested number of final hearing playground transcripts. */
export async function readHearingPlaygroundTranscriptions(page: Page, count: number): Promise<string[]> {
  const transcriptions = page.getByTestId('hearing-playground-transcript')
  await transcriptions.nth(count - 1).waitFor({ state: 'visible', timeout: 60_000 })
  const results = (await transcriptions.allTextContents()).toReversed()
  await page.evaluate((transcriptionResults) => {
    if (window.__airiAudioInputE2E)
      window.__airiAudioInputE2E.transcriptionResults = transcriptionResults
  }, results)
  return results
}

async function waitForElectronPage(
  app: ElectronApplication,
  predicate: (page: Page) => boolean,
  timeoutMs = 60_000,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const page = app.windows().find(predicate)
    if (page) {
      await page.waitForLoadState('domcontentloaded')
      return page
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 100))
  }
  throw new Error('Timed out while waiting for the Electron renderer')
}
