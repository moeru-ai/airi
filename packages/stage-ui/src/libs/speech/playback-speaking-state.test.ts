import type {
  PlaybackEndEvent,
  PlaybackInterruptEvent,
  PlaybackItem,
  PlaybackRejectEvent,
  PlaybackStartEvent,
} from '@proj-airi/pipelines-audio'

import { describe, expect, it } from 'vitest'

import { bindSpeakingStateToPlaybackManager } from './playback-speaking-state'

function createFakePlaybackManager() {
  const listeners = {
    end: [] as Array<(event: PlaybackEndEvent<AudioBuffer>) => void>,
    interrupt: [] as Array<(event: PlaybackInterruptEvent<AudioBuffer>) => void>,
    reject: [] as Array<(event: PlaybackRejectEvent<AudioBuffer>) => void>,
    start: [] as Array<(event: PlaybackStartEvent<AudioBuffer>) => void>,
  }

  return {
    listeners,
    manager: {
      onEnd: (listener: (event: PlaybackEndEvent<AudioBuffer>) => void) => {
        listeners.end.push(listener)
      },
      onInterrupt: (listener: (event: PlaybackInterruptEvent<AudioBuffer>) => void) => {
        listeners.interrupt.push(listener)
      },
      onReject: (listener: (event: PlaybackRejectEvent<AudioBuffer>) => void) => {
        listeners.reject.push(listener)
      },
      onStart: (listener: (event: PlaybackStartEvent<AudioBuffer>) => void) => {
        listeners.start.push(listener)
      },
    },
  }
}

function createPlaybackItem(): PlaybackItem<AudioBuffer> {
  return {
    audio: {} as AudioBuffer,
    createdAt: 1000,
    id: 'playback-1',
    intentId: 'intent-1',
    priority: 0,
    segmentId: 'segment-1',
    sequence: 1,
    special: null,
    streamId: 'stream-1',
    text: 'hello',
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

    playback.listeners.interrupt.forEach(listener => listener({ interruptedAt: 1100, item, reason: 'playback-error' }))
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
