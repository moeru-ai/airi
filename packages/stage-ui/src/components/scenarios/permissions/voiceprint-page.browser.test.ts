import en from '@proj-airi/i18n/locales/en'
import zhHans from '@proj-airi/i18n/locales/zh-Hans'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import VoiceprintPage from './voiceprint-page.vue'

import { computeVoiceprint } from '../../../libs/voice/speaker-model'
import { toStoredVoiceprint } from '../../../libs/voice/voiceprint'
import { useHearingStore } from '../../../stores/modules/hearing'

import 'virtual:uno.css'

// The VAD and the voiceprint model are model runtimes. The fake VAD scores every window of the fake microphone as speech.
vi.mock('../../../workers/vad/silero-vad', () => ({
  SileroVad: class {
    async score() { return 0.9 }
    async close() {}
  },
}))
vi.mock('../../../libs/voice/speaker-model', () => ({
  computeVoiceprint: vi.fn(async (speech: Float32Array, sampleRate: number) => ({ embedding: new Float32Array([1, 0]), seconds: speech.length / sampleRate })),
}))

const speakerRecognitionKey = 'settings/hearing/speaker-recognition-enabled'
const storageKey = 'settings/voice/voiceprints'
/** The orb fills after 8 s of speech, and the fake microphone records in real time. */
const ENROLLMENT_TIMEOUT = { timeout: 15_000 }
const pinias: ReturnType<typeof createPinia>[] = []

afterEach(() => {
  cleanup()
  pinias.splice(0).forEach(pinia => disposePinia(pinia))
  localStorage.clear()
  vi.mocked(computeVoiceprint).mockClear()
})

function renderPage(messages: Record<string, typeof en> = { en }) {
  const pinia = createPinia()
  pinias.push(pinia)
  const screen = render(VoiceprintPage, {
    global: {
      plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages, missingWarn: false, fallbackWarn: false })],
    },
  })
  return { screen, hearing: useHearingStore(pinia) }
}

function saveVoiceprint(count = 1) {
  const records = Array.from({ length: count }, (_, index) => toStoredVoiceprint({ embedding: new Float32Array([1, 0]), seconds: 8 }, { id: `voiceprint-${index + 1}`, label: '', createdAt: Date.now() }))
  localStorage.setItem(storageKey, JSON.stringify(records))
}

function storedVoiceprints(): { id: string, label: string }[] {
  return JSON.parse(localStorage.getItem(storageKey) ?? '[]')
}

describe('voiceprint page', () => {
  it('renders as one element, so the flow transition can animate it', () => {
    const { screen } = renderPage()

    expect([...screen.container.childNodes].map(node => node.nodeType)).toEqual([Node.ELEMENT_NODE])
  })

  it('offers the sample text in each language that has one', async () => {
    const { screen } = renderPage({ en, 'zh-Hans': zhHans })

    await expect.element(screen.getByTestId('voiceprint-sample')).toHaveTextContent('Today I want to check the weather')
    await screen.getByRole('combobox').click()
    await screen.getByRole('option', { name: '简体中文' }).click()

    await expect.element(screen.getByTestId('voiceprint-sample')).toHaveTextContent('今天我想看看天气')
    await expect.element(screen.getByTestId('voiceprint-sample')).toHaveAttribute('lang', 'zh-Hans')
  })

  it('ends the recording when the orb is full, then turns on speaker recognition', { timeout: 30_000 }, async () => {
    const { screen, hearing } = renderPage()

    await screen.getByRole('button', { name: 'Start recording' }).click()

    // The fake microphone speaks all the time, so the status encourages the user, and then tells that the end is near.
    const coaching = screen.getByTestId('voiceprint-coaching')
    await expect.element(coaching).toHaveTextContent('Sounds good, keep going')
    await expect.element(coaching).toHaveTextContent(/\d of 8 s/)
    await expect.element(coaching, ENROLLMENT_TIMEOUT).toHaveTextContent('Almost there')
    expect(hearing.speakerRecognitionEnabled).toBe(false)
    await expect.element(screen.getByText('Your voiceprint is saved.'), ENROLLMENT_TIMEOUT).toBeVisible()

    await expect.element(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
    expect(hearing.speakerRecognitionEnabled).toBe(true)
    expect(localStorage.getItem(speakerRecognitionKey)).toBe('true')
    expect(vi.mocked(computeVoiceprint).mock.calls[0]![0].length / 16000).toBeGreaterThanOrEqual(8)
  })

  it('keeps the actions in place while the recording status changes', async () => {
    const { screen } = renderPage()
    const start = screen.getByRole('button', { name: 'Start recording' })
    const top = start.element().getBoundingClientRect().top

    await start.click()
    await expect.element(screen.getByTestId('voiceprint-coaching')).toHaveTextContent(/[1-9] of 8 s/)

    expect(screen.getByRole('button', { name: 'Cancel' }).element().getBoundingClientRect().top).toBe(top)
    await screen.getByRole('button', { name: 'Cancel' }).click()
  })

  it('deletes the voiceprint that it just saved, and goes back to the start', { timeout: 30_000 }, async () => {
    const { screen, hearing } = renderPage()
    await screen.getByRole('button', { name: 'Start recording' }).click()
    await expect.element(screen.getByText('Your voiceprint is saved.'), ENROLLMENT_TIMEOUT).toBeVisible()
    expect(hearing.speakerRecognitionEnabled).toBe(true)

    await screen.getByRole('button', { name: 'Delete voiceprint 1' }).click()

    await expect.element(screen.getByRole('button', { name: 'Start recording' })).toBeVisible()
    expect(storedVoiceprints()).toEqual([])
    expect(hearing.speakerRecognitionEnabled).toBe(false)
  })

  it('names a saved voiceprint with its label field', async () => {
    saveVoiceprint()
    const { screen } = renderPage()
    const field = screen.getByRole('textbox', { name: 'Label of voiceprint 1' })

    await field.click()
    await expect.element(field).toHaveFocus()
    await field.fill('English')

    await expect.poll(() => storedVoiceprints().map(record => record.label)).toEqual(['English'])
  })

  it('lists both voiceprints at the limit, and sends the user to the settings page for more', async () => {
    saveVoiceprint(2)
    const { screen } = renderPage()

    await expect.element(screen.getByRole('list', { name: 'Saved voiceprints' })).toBeVisible()
    await expect.element(screen.getByText('#1')).toBeVisible()
    await expect.element(screen.getByText('#2')).toBeVisible()
    expect(screen.getByRole('textbox', { name: /Label of voiceprint/ }).elements()).toHaveLength(2)
    await expect.element(screen.getByText('You can enroll more voiceprints later in Settings > Modules > Hearing > Voiceprint.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Enroll another voiceprint' }).query()).toBeNull()
  })

  it('lists the other voiceprint and offers another enrollment when the user deletes one of two voiceprints', async () => {
    saveVoiceprint(2)
    const { screen, hearing } = renderPage()
    hearing.speakerRecognitionEnabled = true

    await screen.getByRole('button', { name: 'Delete voiceprint 1' }).click()

    expect(storedVoiceprints().map(record => record.id)).toEqual(['voiceprint-2'])
    await expect.element(screen.getByRole('button', { name: 'Enroll another voiceprint' })).toBeVisible()
    expect(screen.getByRole('textbox', { name: /Label of voiceprint/ }).elements()).toHaveLength(1)
    await expect.element(screen.getByRole('textbox', { name: 'Label of voiceprint 1' })).toBeVisible()
    expect(hearing.speakerRecognitionEnabled).toBe(true)
  })

  it('shows the setting as it is when the user comes back to the page after the enrollment', async () => {
    saveVoiceprint()
    const { screen, hearing } = renderPage()

    await expect.element(screen.getByText('Your voiceprint is saved.')).toBeVisible()
    await expect.element(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    expect(hearing.speakerRecognitionEnabled).toBe(false)
  })

  it('enrolls another voiceprint, and asks before it keeps a voice unlike the first one', { timeout: 30_000 }, async () => {
    saveVoiceprint()
    vi.mocked(computeVoiceprint).mockImplementationOnce(async (speech, sampleRate) => ({ embedding: new Float32Array([0, 1]), seconds: speech.length / sampleRate }))
    const { screen } = renderPage()

    await screen.getByRole('button', { name: 'Enroll another voiceprint' }).click()
    await expect.element(screen.getByText('This voice is not like your saved voiceprints'), ENROLLMENT_TIMEOUT).toBeVisible()
    expect(storedVoiceprints()).toHaveLength(1)
    await screen.getByRole('button', { name: 'Keep voiceprint' }).click()

    await expect.element(screen.getByText('Your voiceprint is saved.')).toBeVisible()
    expect(storedVoiceprints()).toHaveLength(2)
  })
})
