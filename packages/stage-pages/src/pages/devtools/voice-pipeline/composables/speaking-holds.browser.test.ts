import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/broadcast-channel'
import { BUS_CHANNEL_NAME, speechOutputGetPlaybackState, speechOutputPlaybackStateChangedEvent } from '@proj-airi/stage-ui/services/speech/bus'
import { describe, expect, it, vi } from 'vitest'
import { effectScope, reactive } from 'vue'

import { holdSpeaking, useOtherWindowSpeakingHold } from './speaking-holds'

const speaking = reactive({ nowSpeaking: false })

vi.mock('@proj-airi/stage-ui/stores/audio', () => ({ useSpeakingStore: () => speaking }))

describe('useOtherWindowSpeakingHold', () => {
  // Codex review on PR #30: without echo cancellation, the devtool listener took the main window's reply as a turn.
  it('holds the speaking flag while the output host of another window speaks', async () => {
    const channel = new BroadcastChannel(BUS_CHANNEL_NAME)
    const otherWindow = createContext(channel).context
    const scope = effectScope(true)
    scope.run(() => useOtherWindowSpeakingHold())

    otherWindow.emit(speechOutputPlaybackStateChangedEvent, { speaking: true, voicing: true })
    await expect.poll(() => speaking.nowSpeaking).toBe(true)

    // A playback of this page keeps the flag after the other window stops.
    const release = holdSpeaking()
    otherWindow.emit(speechOutputPlaybackStateChangedEvent, { speaking: false, voicing: true })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(speaking.nowSpeaking).toBe(true)
    release()
    expect(speaking.nowSpeaking).toBe(false)

    // Scope disposal releases a hold that the other window still asks for.
    otherWindow.emit(speechOutputPlaybackStateChangedEvent, { speaking: true, voicing: true })
    await expect.poll(() => speaking.nowSpeaking).toBe(true)
    scope.stop()
    expect(speaking.nowSpeaking).toBe(false)
    channel.close()
  })

  // Codex review on PR #30: a main window that closed during speech sent no final state, so the hold never ended.
  it('ends the hold when the output host of the other window stops answering', async () => {
    const channel = new BroadcastChannel(BUS_CHANNEL_NAME)
    const otherWindow = createContext(channel).context
    const stopAnswering = defineInvokeHandler(otherWindow, speechOutputGetPlaybackState, () => ({ speaking: true, voicing: true }))
    const scope = effectScope(true)
    scope.run(() => useOtherWindowSpeakingHold())

    await expect.poll(() => speaking.nowSpeaking).toBe(true)
    // A check finds the host, so the hold stays.
    await new Promise(resolve => setTimeout(resolve, 2500))
    expect(speaking.nowSpeaking).toBe(true)

    // The window closes during speech. The next check gets no answer.
    stopAnswering()
    channel.close()
    await expect.poll(() => speaking.nowSpeaking, { timeout: 4000 }).toBe(false)
    scope.stop()
  })
})
