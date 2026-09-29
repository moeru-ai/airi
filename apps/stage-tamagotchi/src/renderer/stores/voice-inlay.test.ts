import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useVoiceInlayStore } from './voice-inlay'

describe('voice inlay drafts', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('keeps each character draft and restores the previous draft after send or discard', () => {
    const store = useVoiceInlayStore()

    store.queueVoiceDraft({ cardId: 'a', sessionId: 'session-a', text: 'first' })
    store.queueVoiceDraft({ cardId: 'a', sessionId: 'session-a', text: 'second' })
    expect(store.activeDraft).toEqual({ cardId: 'a', sessionId: 'session-a', text: 'first\nsecond' })

    store.queueVoiceDraft({ cardId: 'b', sessionId: 'session-b', text: 'for B' })
    expect(store.activeDraft).toEqual({ cardId: 'b', sessionId: 'session-b', text: 'for B' })
    expect(store.pendingCount).toBe(1)

    store.removeVoiceDraft('b')
    expect(store.activeDraft).toEqual({ cardId: 'a', sessionId: 'session-a', text: 'first\nsecond' })
    expect(store.pendingCount).toBe(0)
  })
})
