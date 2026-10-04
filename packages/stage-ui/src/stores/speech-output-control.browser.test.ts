import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useSpeechOutputControlStore } from './speech-output-control'

const piniaInstances: Array<ReturnType<typeof createPinia>> = []

afterEach(() => {
  for (const pinia of piniaInstances.splice(0))
    disposePinia(pinia)
  localStorage.clear()
})

describe('speech output control across windows', () => {
  it('delivers stop requests to the Stage output owner', async () => {
    const senderPinia = createPinia()
    piniaInstances.push(senderPinia)
    setActivePinia(senderPinia)
    const sender = useSpeechOutputControlStore()

    const receiverPinia = createPinia()
    piniaInstances.push(receiverPinia)
    setActivePinia(receiverPinia)
    const receiver = useSpeechOutputControlStore()

    sender.requestStopSpeaking('manual-chat')

    await vi.waitFor(() => {
      expect(receiver.latestStopRequest).toEqual({ id: 1, reason: 'manual-chat' })
    })
  })
})
