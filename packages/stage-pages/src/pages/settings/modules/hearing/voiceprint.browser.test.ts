import en from '@proj-airi/i18n/locales/en'

import { speakerModel } from '@proj-airi/stage-shared/speaker-model'
import { updateModelAssetStatus } from '@proj-airi/stage-ui/composables/use-model-asset-status'
import { CAPTURE_LEASE_RENEW_MS } from '@proj-airi/stage-ui/libs/voice/capture-lease'
import { computeVoiceprint } from '@proj-airi/stage-ui/libs/voice/speaker-model'
import { toStoredVoiceprint } from '@proj-airi/stage-ui/libs/voice/voiceprint'
import { getSpeechBusContext, voiceCaptureLease } from '@proj-airi/stage-ui/services/speech/bus'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import VoiceprintPage from './voiceprint.vue'

import 'virtual:uno.css'

// The VAD and the voiceprint model are model runtimes. The fake VAD scores every window as speech.
vi.mock('@proj-airi/stage-ui/workers/vad/silero-vad', () => ({
  SileroVad: class {
    async score() { return 0.9 }
    async close() {}
  },
}))
vi.mock('@proj-airi/stage-ui/libs/voice/speaker-model', () => ({
  computeVoiceprint: vi.fn(async (speech: Float32Array, sampleRate: number) => ({ embedding: new Float32Array([1, 0]), seconds: speech.length / sampleRate })),
}))

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanup()
  cleanups.splice(0).forEach(stop => stop())
  localStorage.clear()
})

function renderPage() {
  const pinia = createPinia()
  cleanups.push(() => disposePinia(pinia))
  return render(VoiceprintPage, {
    global: {
      plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: false, fallbackWarn: false })],
    },
  })
}

/** Records the capture leases that the page sends to the voice host. */
function watchLeases() {
  const leases: { id: string, until: number }[] = []
  cleanups.push(getSpeechBusContext().on(voiceCaptureLease, ({ body }) => {
    if (body)
      leases.push(body)
  }))
  return {
    /** True when the last lease message renews a lease, false when it releases it. */
    held: () => (leases.at(-1)?.until ?? 0) > 0,
    count: () => leases.length,
  }
}

describe('voiceprint settings', () => {
  it('shows the saved voiceprint and deletes it', async () => {
    localStorage.setItem('settings/voice/voiceprint', JSON.stringify(toStoredVoiceprint({ embedding: new Float32Array([1, 0]), seconds: 11.6 }, Date.UTC(2026, 9, 14))))
    const screen = renderPage()

    await expect.element(screen.getByTestId('voiceprint-status')).toHaveAttribute('data-state', 'enrolled')
    await expect.element(screen.getByTestId('voiceprint-status')).toHaveTextContent('from 12 s of speech')
    await expect.element(screen.getByTestId('voiceprint-start')).toHaveTextContent('Enroll again')

    await screen.getByRole('button', { name: 'Delete voiceprint' }).click()
    await screen.getByRole('button', { name: 'Yes' }).click()

    await expect.element(screen.getByTestId('voiceprint-status')).toHaveAttribute('data-state', 'none')
    expect(localStorage.getItem('settings/voice/voiceprint')).toBeNull()
  })

  it('asks for a new enrollment when another model revision computed the voiceprint', async () => {
    const stored = toStoredVoiceprint({ embedding: new Float32Array([1, 0]), seconds: 8 }, Date.now())
    localStorage.setItem('settings/voice/voiceprint', JSON.stringify({ ...stored, modelRevision: 'older-revision' }))
    const screen = renderPage()

    await expect.element(screen.getByTestId('voiceprint-status')).toHaveAttribute('data-state', 'outdated')
    await expect.element(screen.getByTestId('voiceprint-status')).toHaveTextContent('Enroll again to use your voiceprint')
  })

  it('turns on speaker recognition when a usable voiceprint exists', async () => {
    localStorage.setItem('settings/voice/voiceprint', JSON.stringify(toStoredVoiceprint({ embedding: new Float32Array([1, 0]), seconds: 8 }, Date.now())))
    const screen = renderPage()
    const toggle = screen.getByRole('switch')

    await expect.element(toggle).toBeEnabled()
    await expect.element(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()

    await expect.element(toggle).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => localStorage.getItem('settings/hearing/speaker-recognition-enabled')).toBe('true')
  })

  it('keeps speaker recognition unavailable until the user enrolls', async () => {
    const screen = renderPage()

    await expect.element(screen.getByRole('switch')).toBeDisabled()
    await expect.element(screen.getByText('Enroll your voice to turn on speaker recognition.')).toBeVisible()
  })

  it('records with a capture lease, enables Finish after 5 s of speech, and saves the voiceprint', async () => {
    const leases = watchLeases()
    const screen = renderPage()

    await screen.getByTestId('voiceprint-start').click()

    await vi.waitFor(() => expect(leases.held()).toBe(true))
    await expect.element(screen.getByTestId('voiceprint-progress')).toHaveTextContent('Enrollment needs at least 5 s.')
    await expect.element(screen.getByTestId('voiceprint-finish')).toBeDisabled()
    await expect.element(screen.getByTestId('voiceprint-finish'), { timeout: 10_000 }).toBeEnabled()

    await screen.getByTestId('voiceprint-finish').click()

    await expect.element(screen.getByTestId('voiceprint-result')).toHaveTextContent('Your voiceprint is saved.')
    await expect.element(screen.getByTestId('voiceprint-status')).toHaveAttribute('data-state', 'enrolled')
    expect(leases.held()).toBe(false)
  })

  it('explains a failed voiceprint model download instead of the raw error', async () => {
    // The model asset repository records the failure, and then the model load rejects with its raw message.
    vi.mocked(computeVoiceprint).mockImplementationOnce(async () => {
      updateModelAssetStatus({
        id: speakerModel.id,
        revision: speakerModel.revision,
        state: 'error',
        error: { reason: 'network', host: 'huggingface.co', message: 'Model asset download failed. Could not connect to huggingface.co: fetch failed.' },
      })
      throw new Error('Model asset download failed. Could not connect to huggingface.co: fetch failed.')
    })
    const screen = renderPage()

    await screen.getByRole('button', { name: 'Start recording' }).click()
    await expect.element(screen.getByRole('button', { name: 'Finish' }), { timeout: 10_000 }).toBeEnabled()
    await screen.getByRole('button', { name: 'Finish' }).click()

    await expect.element(screen.getByText('Enrollment failed: Could not connect to huggingface.co. Check your network or proxy settings.')).toBeVisible()
    expect(screen.container.textContent).not.toContain('fetch failed')
  })

  it('releases the capture lease and saves nothing when the user cancels', async () => {
    const leases = watchLeases()
    const screen = renderPage()

    await screen.getByTestId('voiceprint-start').click()
    await vi.waitFor(() => expect(leases.held()).toBe(true))
    await screen.getByTestId('voiceprint-cancel').click()

    await expect.element(screen.getByTestId('voiceprint-result')).toHaveTextContent('Enrollment cancelled.')
    expect(leases.held()).toBe(false)
    expect(localStorage.getItem('settings/voice/voiceprint')).toBeNull()
  })

  it('ends the enrollment and releases the capture lease when the page unmounts', async () => {
    const leases = watchLeases()
    const screen = renderPage()

    await screen.getByTestId('voiceprint-start').click()
    await vi.waitFor(() => expect(leases.held()).toBe(true))
    screen.unmount()

    await vi.waitFor(() => expect(leases.held()).toBe(false))
    const released = leases.count()
    // A released lease is not renewed again. Wait longer than one renewal period to show it.
    await new Promise(resolve => setTimeout(resolve, CAPTURE_LEASE_RENEW_MS * 1.5))
    expect(leases.count()).toBe(released)
  })
})
