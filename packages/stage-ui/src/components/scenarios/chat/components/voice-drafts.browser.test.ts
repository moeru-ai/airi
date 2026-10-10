import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import VoiceDrafts from './voice-drafts.vue'

import { getSpeechBusContext, voiceSnapshotChanged } from '../../../../services/speech/bus'
import { useChatSessionStore } from '../../../../stores/chat/session-store'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  localStorage.clear()
})

function renderComposer(attrs: { onPresence?: (visible: boolean) => void, showSilentSpeech?: boolean } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  cleanups.push(() => disposePinia(pinia))
  // The inlay gives the composer a fixed height. Long text then scrolls inside it.
  const container = document.body.appendChild(Object.assign(document.createElement('div'), { style: 'height: 160px; width: 320px' }))
  cleanups.push(() => container.remove())
  return render(VoiceDrafts, {
    container,
    props: { variant: 'composer', ...attrs },
    global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

describe('voiceDrafts composer variant', () => {
  it('continues the draft with live speech in one read-only paragraph', async () => {
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

    const live = view.getByTestId('voice-draft-live')
    await expect.element(live).toHaveTextContent('First sentence, rephrased. Second part. Still talking')
    expect(view.getByRole('textbox', { name: 'Voice draft' }).query()).toBeNull()
    await expect.element(view.getByText('Second part.')).toHaveAttribute('data-tier', 'interim')
    await expect.element(view.getByText('Still talking')).toHaveAttribute('data-tier', 'latest')
    await expect.element(view.getByText('Listening')).toBeVisible()
    await expect.element(view.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })

  it('shows a silent capture only when the host asks for it', async () => {
    const silentInput = { requestId: 'speech', sessionId: 'alice', phase: 'capturing' as const, text: '', segments: [] }

    const hidden: boolean[] = []
    const plain = renderComposer({ onPresence: (visible: boolean) => hidden.push(visible) })
    getSpeechBusContext().emit(voiceSnapshotChanged, { connected: true, drafts: [], input: silentInput })
    await expect.element(plain.getByRole('region', { name: 'Voice draft' })).not.toBeInTheDocument()
    expect(hidden).toEqual([false])
    plain.unmount()
    cleanups.splice(0).forEach(cleanup => cleanup())

    const shown: boolean[] = []
    const inlay = renderComposer({ showSilentSpeech: true, onPresence: (visible: boolean) => shown.push(visible) })
    getSpeechBusContext().emit(voiceSnapshotChanged, { connected: true, drafts: [], input: silentInput })
    await expect.element(inlay.getByText('Listening')).toBeVisible()
    await expect.element(inlay.getByRole('button', { name: 'Send message' })).toBeDisabled()
    expect(shown).toEqual([false, true])
  })

  it('hides a draft while the host sends it and reports that nothing is shown', async () => {
    const presence: boolean[] = []
    const view = renderComposer({ onPresence: (visible: boolean) => presence.push(visible) })
    const draft = { id: 'draft', sessionId: 'alice', rawText: 'hello', text: 'Hello there.' }
    const context = getSpeechBusContext()
    context.emit(voiceSnapshotChanged, { connected: true, drafts: [draft], frontDraftId: 'draft' })
    await expect.element(view.getByRole('textbox', { name: 'Voice draft' })).toHaveValue('Hello there.')

    context.emit(voiceSnapshotChanged, { connected: true, drafts: [{ ...draft, sending: true }], frontDraftId: 'draft' })

    await expect.element(view.getByRole('region', { name: 'Voice draft' })).not.toBeInTheDocument()
    expect(presence).toEqual([false, true, false])
  })

  it('switches between drafts of different conversations by name', async () => {
    const view = renderComposer()
    const sessions = useChatSessionStore()
    sessions.sessionMetas = {
      alice: { sessionId: 'alice', userId: 'user', characterId: '', title: 'Trip plans', createdAt: 0, updatedAt: 0 },
      bob: { sessionId: 'bob', userId: 'user', characterId: '', title: 'Groceries', createdAt: 0, updatedAt: 0 },
    }
    getSpeechBusContext().emit(voiceSnapshotChanged, {
      connected: true,
      drafts: [
        { id: 'first', sessionId: 'alice', rawText: 'a', text: 'Book the train.' },
        { id: 'second', sessionId: 'bob', rawText: 'b', text: 'Buy milk.' },
      ],
      frontDraftId: 'second',
    })

    await expect.element(view.getByRole('button', { name: 'Groceries' })).toHaveAttribute('aria-pressed', 'true')
    await expect.element(view.getByRole('button', { name: 'Trip plans' })).toHaveAttribute('aria-pressed', 'false')
    await expect.element(view.getByRole('textbox', { name: 'Voice draft' })).toHaveValue('Buy milk.')
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
