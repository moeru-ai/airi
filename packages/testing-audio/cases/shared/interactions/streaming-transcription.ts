import type { Page } from 'playwright'

/** Records distinct visible transcription values until the page closes. */
export async function captureStreamingTranscription(page: Page, selector: string): Promise<void> {
  await page.evaluate((captureSelector) => {
    let lastUpdate = ''
    setInterval(() => {
      const element = document.querySelector(captureSelector)
      const value = element instanceof HTMLTextAreaElement
        ? element.value
        : element?.textContent
      const update = value?.trim() ?? ''
      const updates = window.__airiAudioInputE2E?.streamingTranscriptionUpdates
      if (update && update !== lastUpdate && updates) {
        lastUpdate = update
        updates.push(update)
      }
    }, 20)
  }, selector)
}
