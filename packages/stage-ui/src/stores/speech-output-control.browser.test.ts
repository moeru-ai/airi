import type { TurnRef } from '@proj-airi/core-agent'

import { defineInvokeHandler } from '@moeru/eventa'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

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

  it('clamps the persisted speech volume to the 0..1 gain range', async () => {
    const store = createStore()
    expect(store.speechVolume).toBe(1)
    store.setSpeechVolume(0.42)
    expect(store.speechVolume).toBe(0.42)
    // useLocalStorage persists on the next tick.
    await nextTick()
    expect(localStorage.getItem('settings/speech/output-volume')).toBe('0.42')
    store.setSpeechVolume(7)
    expect(store.speechVolume).toBe(1)
    store.setSpeechVolume(-1)
    expect(store.speechVolume).toBe(0)
  })

  it('couples zero volume with mute and restores the last audible volume on unmute', () => {
    const store = createStore()
    store.setSpeechVolume(0.42)
    expect(store.speechMuted).toBe(false)
    store.setSpeechVolume(0)
    expect(store.speechMuted).toBe(true)
    // Unmuting a zeroed slider restores audible playback instead of silent synthesis.
    store.setSpeechMuted(false)
    expect(store.speechVolume).toBe(0.42)
    // Raising the volume while muted restores the voice.
    store.setSpeechMuted(true)
    store.setSpeechVolume(0.8)
    expect(store.speechMuted).toBe(false)
  })
})
