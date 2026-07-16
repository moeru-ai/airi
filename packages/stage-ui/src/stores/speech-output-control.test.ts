import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useSpeechOutputControlStore } from './speech-output-control'

describe('speech output control store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('records manual chat stop-speaking requests with monotonic sequence numbers', () => {
    const store = useSpeechOutputControlStore()

    expect(store.latestStopRequest).toBeUndefined()

    store.requestStopSpeaking('manual-chat')

    expect(store.latestStopRequest).toEqual({
      id: 1,
      reason: 'manual-chat',
    })

    store.requestStopSpeaking('manual-chat')

    expect(store.latestStopRequest).toEqual({
      id: 2,
      reason: 'manual-chat',
    })
  })
})
