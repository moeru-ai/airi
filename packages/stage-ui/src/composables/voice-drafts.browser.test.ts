import type { SpeechSubmission } from '@proj-airi/core-agent'

import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useChatStore } from '../stores/chat'
import { useVoiceDrafts } from './voice-drafts'

const cleanups: (() => void)[] = []

function mountDrafts() {
  // Stubbed actions keep the real store state and replace only the chat transport.
  const pinia = createTestingPinia({ createSpy: vi.fn })
  setActivePinia(pinia)
  let drafts!: ReturnType<typeof useVoiceDrafts>
  const app = createApp(defineComponent({ setup() {
    drafts = useVoiceDrafts(vi.fn())
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
