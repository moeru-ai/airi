import type { TurnRef } from '@proj-airi/core-agent'

import { defineInvokeHandler } from '@moeru/eventa'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { getSpeechBusContext, voiceGetTurns, voiceInterrupt } from '../services/speech/bus'
import { useSpeechOutputControlStore } from './speech-output-control'

const cleanups: (() => void)[] = []

function createStore() {
  const pinia = createPinia()
  setActivePinia(pinia)
  cleanups.push(() => disposePinia(pinia))
  return useSpeechOutputControlStore()
}

afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  localStorage.clear()
})

describe('speech output control', () => {
  it('waits for the output host receipt and targets only the selected session', async () => {
    const context = getSpeechBusContext()
    const stored = Promise.withResolvers<{ status: 'recorded' }>()
    const interrupt = vi.fn(() => stored.promise)
    cleanups.push(defineInvokeHandler(context, voiceGetTurns, () => [
      { sessionId: 'alice', turnId: 'reply-a' },
      { sessionId: 'bob', turnId: 'reply-b' },
    ]))
    cleanups.push(defineInvokeHandler(context, voiceInterrupt, interrupt))
    const sender = createStore()
    let received = false
    const request = sender.requestStopSpeaking({ reason: 'manual-chat', sessionId: 'alice' }).then((receipt) => {
      received = true
      return receipt
    })
    await vi.waitFor(() => expect(interrupt).toHaveBeenCalledWith({ turns: [{ sessionId: 'alice', turnId: 'reply-a' }], cause: 'manual-chat' }, expect.anything()))
    expect(received).toBe(false)
    stored.resolve({ status: 'recorded' })
    expect(await request).toEqual({ status: 'recorded' })
  })

  it('targets all known responses only for an explicit all-sessions command', async () => {
    const context = getSpeechBusContext()
    const turns = [{ sessionId: 'alice', turnId: 'reply-a' }, { sessionId: 'bob', turnId: 'reply-b' }]
    cleanups.push(defineInvokeHandler(context, voiceGetTurns, () => turns))
    const interrupt = vi.fn(async (_request: { turns: readonly TurnRef[], cause: string }) => ({ status: 'recorded' as const }))
    cleanups.push(defineInvokeHandler(context, voiceInterrupt, interrupt))
    expect(await createStore().requestStopSpeaking({ reason: 'manual-all' })).toEqual({ status: 'recorded' })
    expect(interrupt.mock.calls[0]?.[0]).toEqual({ turns, cause: 'manual-all' })
  })
})
