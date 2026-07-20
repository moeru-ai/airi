import type {
  PlaybackEndEvent,
  PlaybackInterruptEvent,
  PlaybackItem,
  PlaybackRejectEvent,
  PlaybackStartEvent,
} from '@proj-airi/pipelines-audio'

import { describe, expect, it } from 'vitest'

import { bindSpeakingStateToPlaybackManager } from './playback-speaking-state'

function createPlaybackItem(): PlaybackItem<AudioBuffer> {
  return {
    id: 'playback-1',
    streamId: 'stream-1',
    intentId: 'intent-1',
    segmentId: 'segment-1',
    sequence: 1,
    priority: 0,
    text: 'hello',
    special: null,
    audio: {} as AudioBuffer,
    createdAt: 1000,
  }
}

function createFakePlaybackManager() {
  const listeners = {
    start: [] as Array<(event: PlaybackStartEvent<AudioBuffer>) => void>,
    end: [] as Array<(event: PlaybackEndEvent<AudioBuffer>) => void>,
    interrupt: [] as Array<(event: PlaybackInterruptEvent<AudioBuffer>) => void>,
    reject: [] as Array<(event: PlaybackRejectEvent<AudioBuffer>) => void>,
  }

  return {
    listeners,
    manager: {
      onStart: (listener: (event: PlaybackStartEvent<AudioBuffer>) => void) => {
        listeners.start.push(listener)
      },
      onEnd: (listener: (event: PlaybackEndEvent<AudioBuffer>) => void) => {
        listeners.end.push(listener)
      },
      onInterrupt: (listener: (event: PlaybackInterruptEvent<AudioBuffer>) => void) => {
        listeners.interrupt.push(listener)
      },
      onReject: (listener: (event: PlaybackRejectEvent<AudioBuffer>) => void) => {
        listeners.reject.push(listener)
      },
    },
  }
}

describe('bindSpeakingStateToPlaybackManager', () => {
  it('resets speaking state when playback is interrupted', () => {
    const playback = createFakePlaybackManager()
    let speaking = false

    bindSpeakingStateToPlaybackManager(playback.manager, {
      setSpeaking: (value) => {
        speaking = value
      },
    })

    const item = createPlaybackItem()
    playback.listeners.start.forEach(listener => listener({ item, startedAt: 1000 }))
    expect(speaking).toBe(true)

    playback.listeners.interrupt.forEach(listener => listener({ item, reason: 'playback-error', interruptedAt: 1100 }))
    expect(speaking).toBe(false)
  })

  it('resets speaking state when playback is rejected before it can finish', () => {
    const playback = createFakePlaybackManager()
    let speaking = true

    bindSpeakingStateToPlaybackManager(playback.manager, {
      setSpeaking: (value) => {
        speaking = value
      },
    })

    const item = createPlaybackItem()
    playback.listeners.reject.forEach(listener => listener({ item, reason: 'overflow' }))

    expect(speaking).toBe(false)
  })
})
