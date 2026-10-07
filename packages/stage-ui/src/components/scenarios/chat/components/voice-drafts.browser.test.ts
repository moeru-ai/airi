import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import VoiceDrafts from './voice-drafts.vue'

import { getSpeechBusContext, voiceSnapshotChanged } from '../../../../services/speech/bus'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  localStorage.clear()
})

function renderComposer() {
  const pinia = createPinia()
  cleanups.push(() => disposePinia(pinia))
  // The inlay gives the composer a fixed height. Long text then scrolls inside it.
  const container = document.body.appendChild(Object.assign(document.createElement('div'), { style: 'height: 160px; width: 320px' }))
  cleanups.push(() => container.remove())
  return render(VoiceDrafts, {
    container,
    props: { variant: 'composer' },
    global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

describe('voiceDrafts composer variant', () => {
  it('keeps the draft editable and separates earlier and newest interim text while speech is transcribed', async () => {
    const view = renderComposer()
    getSpeechBusContext().emit(voiceSnapshotChanged, {
      connected: true,
      drafts: [{ id: 'draft', sessionId: 'alice', rawText: 'first raw', text: 'First sentence, rephrased.' }],
      frontDraftId: 'draft',
      input: {
        requestId: 'speech',
        sessionId: 'alice',
        phase: 'capturing',
        text: 'Second part. Still talking',
        segments: [
          { id: 'speech-0', text: 'Second part. ', final: false },
          { id: 'speech-1', text: 'Still talking', final: false },
        ],
      },
    })

    await expect.element(view.getByTestId('voice-draft-live')).toBeVisible()
    await expect.element(view.getByRole('textbox', { name: 'Voice draft' })).toHaveValue('First sentence, rephrased.')
    await expect.element(view.getByRole('textbox', { name: 'Voice draft' })).toBeEnabled()
    await expect.element(view.getByText('Second part.')).toHaveAttribute('data-tier', 'interim')
    await expect.element(view.getByText('Still talking')).toHaveAttribute('data-tier', 'latest')
    await expect.element(view.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })

  it('keeps the newest live text scrolled into view', async () => {
    const view = renderComposer()
    const context = getSpeechBusContext()
    const segments = Array.from({ length: 12 }, (_, index) => ({ id: `speech-${index}`, text: `Sentence number ${index + 1}. `, final: false }))
    const emit = (count: number) => context.emit(voiceSnapshotChanged, {
      connected: true,
      drafts: [],
      input: { requestId: 'speech', sessionId: 'alice', phase: 'capturing', text: '', segments: segments.slice(0, count) },
    })

    emit(2)
    await expect.element(view.getByTestId('voice-draft-live')).toBeVisible()
    emit(12)
    await expect.element(view.getByText('Sentence number 12.')).toBeVisible()

    const scroller = view.getByTestId('voice-draft-scroller').element()
    await expect.poll(() => scroller.scrollHeight > scroller.clientHeight).toBe(true)
    await expect.poll(() => scroller.scrollTop + scroller.clientHeight).toBeGreaterThanOrEqual(scroller.scrollHeight - 1)
  })

  it('returns to the editable draft after the input settles', async () => {
    const view = renderComposer()
    const context = getSpeechBusContext()
    const draft = { id: 'draft', sessionId: 'alice', rawText: 'hello', text: 'Hello there.' }
    context.emit(voiceSnapshotChanged, {
      connected: true,
      drafts: [draft],
      frontDraftId: 'draft',
      input: { requestId: 'speech', sessionId: 'alice', phase: 'finalizing', text: 'hello', segments: [{ id: 'speech-0', text: 'hello', final: true }] },
    })
    await expect.element(view.getByText('Finishing…')).toBeVisible()

    context.emit(voiceSnapshotChanged, {
      connected: true,
      drafts: [draft],
      frontDraftId: 'draft',
      input: { requestId: 'speech', sessionId: 'alice', phase: 'settled', text: 'hello', segments: [{ id: 'speech-0', text: 'hello', final: true }] },
    })

    await expect.element(view.getByRole('textbox', { name: 'Voice draft' })).toHaveValue('Hello there.')
    await expect.element(view.getByRole('button', { name: 'Send message' })).toBeEnabled()
  })
})
