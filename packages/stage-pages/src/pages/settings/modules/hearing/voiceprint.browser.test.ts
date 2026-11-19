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
  // The shared components import the speaker tracker store. This page never loads the tracker.
  loadSpeakerTracker: vi.fn(async () => { throw new Error('The voiceprint page must not load the speaker tracker') }),
}))

const cleanups: (() => void)[] = []
const storageKey = 'settings/voice/voiceprints'

/** Saves voiceprints as an earlier enrollment did. */
function saveVoiceprints(...records: { label: string, embedding?: number[], seconds?: number, createdAt?: number, modelRevision?: string }[]) {
  localStorage.setItem(storageKey, JSON.stringify(records.map((record, index) => {
    const stored = toStoredVoiceprint(
      { embedding: new Float32Array(record.embedding ?? [1, 0]), seconds: record.seconds ?? 8 },
      { id: `voiceprint-${index + 1}`, label: record.label, createdAt: record.createdAt ?? Date.now() },
    )
    return record.modelRevision ? { ...stored, modelRevision: record.modelRevision } : stored
  })))
}

/** The voiceprints in storage. */
function storedVoiceprints(): { id: string, label: string, enabled: boolean }[] {
  return JSON.parse(localStorage.getItem(storageKey) ?? '[]')
}

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
  it('lists each saved voiceprint and deletes one', async () => {
    saveVoiceprints({ label: 'English', seconds: 11.6, createdAt: Date.UTC(2026, 9, 14) }, { label: 'Chinese' })
    const screen = renderPage()
    const first = screen.getByTestId('voiceprint-row').first()

    await expect.element(first).toHaveAttribute('data-state', 'usable')
    await expect.element(first).toHaveTextContent('from 12 s of speech')
    await expect.element(first.getByRole('textbox', { name: 'Label' })).toHaveValue('English')
    await expect.element(screen.getByTestId('voiceprint-start')).toHaveTextContent('Enroll another voiceprint')

    await first.getByRole('button', { name: 'Delete' }).click()
    await screen.getByRole('button', { name: 'Yes' }).click()

    await expect.poll(() => storedVoiceprints().map(record => record.label)).toEqual(['Chinese'])
    await expect.element(screen.getByTestId('voiceprint-row')).toHaveTextContent('from 8 s of speech')
  })

  it('saves a label as the user types it', async () => {
    saveVoiceprints({ label: 'Default' })
    const screen = renderPage()

    await screen.getByRole('textbox', { name: 'Label' }).fill('Office microphone')

    await expect.poll(() => storedVoiceprints()[0].label).toBe('Office microphone')
  })

  it('asks for a new enrollment when another model revision computed the voiceprint', async () => {
    saveVoiceprints({ label: 'Default', modelRevision: 'older-revision' })
    const screen = renderPage()
    const row = screen.getByTestId('voiceprint-row')

    await expect.element(row).toHaveAttribute('data-state', 'outdated')
    await expect.element(row).toHaveTextContent('Enroll again to use this voiceprint')
    await expect.element(row.getByRole('switch')).toBeDisabled()
    await expect.element(screen.getByTestId('speaker-recognition').getByRole('switch')).toBeDisabled()
  })

  it('turns speaker recognition off for a voiceprint with its switch', async () => {
    saveVoiceprints({ label: 'English' }, { label: 'Chinese' })
    const screen = renderPage()

    await screen.getByTestId('voiceprint-row').first().getByRole('switch').click()

    await expect.poll(() => storedVoiceprints().map(record => record.enabled)).toEqual([false, true])
  })

  it('keeps speaker recognition unavailable while no voiceprint is turned on', async () => {
    saveVoiceprints({ label: 'English' })
    const screen = renderPage()
    const toggle = screen.getByTestId('speaker-recognition').getByRole('switch')
    await expect.element(toggle).toBeEnabled()

    await screen.getByTestId('voiceprint-row').getByRole('switch').click()

    await expect.element(toggle).toBeDisabled()
  })

  it('turns on speaker recognition when a usable voiceprint exists', async () => {
    saveVoiceprints({ label: 'English' })
    const screen = renderPage()
    const toggle = screen.getByTestId('speaker-recognition').getByRole('switch')

    await expect.element(toggle).toBeEnabled()
    await expect.element(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()

    await expect.element(toggle).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => localStorage.getItem('settings/hearing/speaker-recognition-enabled')).toBe('true')
  })

  it('keeps speaker recognition unavailable until the user enrolls', async () => {
    const screen = renderPage()

    await expect.element(screen.getByRole('switch')).toBeDisabled()
    await expect.element(screen.getByTestId('voiceprint-empty')).toHaveTextContent('You have no voiceprint.')
    await expect.element(screen.getByText('To use speaker recognition, enroll a voiceprint and turn on Use for speaker recognition for it.')).toBeVisible()
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
    await expect.element(screen.getByTestId('voiceprint-row')).toHaveAttribute('data-state', 'usable')
    expect(storedVoiceprints()).toHaveLength(1)
    expect(leases.held()).toBe(false)
  })

  it('asks before it saves a voice that is not like the saved voiceprints, and keeps it on request', async () => {
    saveVoiceprints({ label: 'English', embedding: [1, 0] })
    vi.mocked(computeVoiceprint).mockImplementationOnce(async (speech, sampleRate) => ({ embedding: new Float32Array([0, 1]), seconds: speech.length / sampleRate }))
    const screen = renderPage()

    await screen.getByTestId('voiceprint-start').click()
    await expect.element(screen.getByTestId('voiceprint-finish'), { timeout: 10_000 }).toBeEnabled()
    await screen.getByTestId('voiceprint-finish').click()

    await expect.element(screen.getByTestId('voiceprint-review')).toHaveTextContent('A different person, language, or microphone can cause this.')
    expect(storedVoiceprints()).toHaveLength(1)
    await screen.getByTestId('voiceprint-keep').click()

    await expect.element(screen.getByTestId('voiceprint-result')).toHaveTextContent('Your voiceprint is saved.')
    expect(storedVoiceprints()).toHaveLength(2)
  })

  it('discards a voice that is not like the saved voiceprints on request', async () => {
    saveVoiceprints({ label: 'English', embedding: [1, 0] })
    vi.mocked(computeVoiceprint).mockImplementationOnce(async (speech, sampleRate) => ({ embedding: new Float32Array([0, 1]), seconds: speech.length / sampleRate }))
    const screen = renderPage()

    await screen.getByTestId('voiceprint-start').click()
    await expect.element(screen.getByTestId('voiceprint-finish'), { timeout: 10_000 }).toBeEnabled()
    await screen.getByTestId('voiceprint-finish').click()
    await screen.getByTestId('voiceprint-discard').click()

    await expect.element(screen.getByTestId('voiceprint-result')).toHaveTextContent('Enrollment cancelled. Nothing was saved.')
    expect(storedVoiceprints()).toHaveLength(1)
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
    expect(storedVoiceprints()).toEqual([])
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
