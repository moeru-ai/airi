import type { SpeechSubmission } from '@proj-airi/core-agent'

import type { ChatToolReference } from '../types/chat'

import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useChatStore } from '../stores/chat'
import { useVoiceDrafts } from './voice-drafts'

const cleanups: (() => void)[] = []

function mountDrafts(tools: () => readonly ChatToolReference[] | undefined = () => undefined, autoSend?: () => boolean) {
  // Stubbed actions keep the real store state and replace only the chat transport.
  const pinia = createTestingPinia({ createSpy: vi.fn })
  setActivePinia(pinia)
  let drafts!: ReturnType<typeof useVoiceDrafts>
  const app = createApp(defineComponent({ setup() {
    drafts = useVoiceDrafts(vi.fn(), tools, autoSend)
    return () => h('div')
  } }))
  app.use(pinia).use(createI18n({ legacy: false, locale: 'en', messages: { en: {} } }))
  const element = document.createElement('div')
  document.body.append(element)
  app.mount(element)
  cleanups.push(() => {
    app.unmount()
    element.remove()
  })
  return { drafts, chat: useChatStore(pinia) }
}

function spokenSubmission(text: string): SpeechSubmission {
  const snapshot = { revision: 1, text, segments: [] }
  return {
    submissionId: 'draft',
    sessionId: 'session',
    text,
    transcript: { raw: snapshot, corrected: snapshot, history: [snapshot], patches: [] },
    context: [],
  }
}

afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  localStorage.clear()
})

it('keeps a draft available while its chat submission is pending', async () => {
  const { drafts, chat } = mountDrafts()
  const receipt = Promise.withResolvers<{ sessionId: string, messageId: string }>()
  vi.mocked(chat.submit).mockReturnValue(receipt.promise)
  expect(await drafts.acceptSpeech(spokenSubmission('spoken'), new AbortController().signal)).toEqual({ status: 'drafted', draftId: 'draft' })

  const pending = drafts.sendDraft('draft')

  expect(drafts.discardDraft('draft')).toBe(false)
  expect(drafts.editDraft('draft', 'late edit')).toBe(false)
  expect(drafts.drafts.value[0].text).toBe('spoken')

  receipt.resolve({ sessionId: 'session', messageId: 'message' })

  await expect(pending).resolves.toEqual({ sessionId: 'session', messageId: 'message' })
  expect(chat.submit).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session', messageId: 'draft', text: 'spoken' }))
  expect(drafts.drafts.value).toEqual([])
  expect(drafts.frontDraftId.value).toBeUndefined()
})

it('sends a spoken draft with the tools that the application granted to new turns', async () => {
  let granted: ChatToolReference[] = [{ name: 'get_weather' }]
  const { drafts, chat } = mountDrafts(() => granted)
  vi.mocked(chat.submit).mockResolvedValue({ sessionId: 'session', messageId: 'draft' })
  await drafts.acceptSpeech(spokenSubmission('weather tomorrow'), new AbortController().signal)
  // The selection can change while the draft waits. The send reads the selection of that moment.
  granted = [{ name: 'get_weather' }, { name: 'computer_use' }]

  await drafts.sendDraft('draft')

  expect(chat.submit).toHaveBeenCalledWith(expect.objectContaining({ tools: [{ name: 'get_weather' }, { name: 'computer_use' }] }))
})

it('sends a spoken draft without tools when the application grants none', async () => {
  const { drafts, chat } = mountDrafts()
  vi.mocked(chat.submit).mockResolvedValue({ sessionId: 'session', messageId: 'draft' })
  await drafts.acceptSpeech(spokenSubmission('hello'), new AbortController().signal)

  await drafts.sendDraft('draft')

  expect(vi.mocked(chat.submit).mock.calls[0]![0]).not.toHaveProperty('tools')
})

it('keeps speaker evidence out of the speech context that the chat model reads', async () => {
  const { drafts, chat } = mountDrafts()
  vi.mocked(chat.submit).mockResolvedValue({ sessionId: 'session', messageId: 'draft' })
  const submission = { ...spokenSubmission('who is speaking'), speakers: { revision: 1, candidates: [{ speakerId: 'owner', score: 0.2 }], voicedMs: 1200 } }
  await drafts.acceptSpeech(submission, new AbortController().signal)

  await drafts.sendDraft('draft')

  expect(vi.mocked(chat.submit).mock.calls[0]![0].speechContext).toBeUndefined()
})

it('sends plugin context without the speaker evidence of the same input', async () => {
  const { drafts, chat } = mountDrafts()
  vi.mocked(chat.submit).mockResolvedValue({ sessionId: 'session', messageId: 'draft' })
  const submission = {
    ...spokenSubmission('remind me'),
    context: [{ plugin: 'calendar', key: 'today', revision: 1, value: 'Friday' }],
    speakers: { revision: 1, candidates: [{ speakerId: 'owner', score: 0.2 }], voicedMs: 1200 },
  }
  await drafts.acceptSpeech(submission, new AbortController().signal)

  await drafts.sendDraft('draft')

  expect(JSON.parse(vi.mocked(chat.submit).mock.calls[0]![0].speechContext!)).toEqual([{ context: [{ plugin: 'calendar', key: 'today', revision: 1, value: 'Friday' }] }])
})

// A voice call sends each spoken input at once, even with the Hearing Auto send setting off.
it('sends speech at once when the auto send getter says so, without keeping a draft', async () => {
  let inCall = true
  const { drafts, chat } = mountDrafts(undefined, () => inCall)
  vi.mocked(chat.submit).mockResolvedValue({ sessionId: 'session', messageId: 'draft' })

  const result = await drafts.acceptSpeech(spokenSubmission('hello there'), new AbortController().signal)

  expect(result).toEqual({ status: 'committed', messageId: 'draft' })
  expect(chat.submit).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session', text: 'hello there' }))
  expect(drafts.drafts.value).toEqual([])

  // After the call, the setting decides again. It is off by default, so the speech waits as a draft.
  inCall = false
  const later = { ...spokenSubmission('after the call'), submissionId: 'later' }
  expect(await drafts.acceptSpeech(later, new AbortController().signal)).toEqual({ status: 'drafted', draftId: 'later' })
  expect(drafts.drafts.value.map(draft => draft.text)).toEqual(['after the call'])
})
