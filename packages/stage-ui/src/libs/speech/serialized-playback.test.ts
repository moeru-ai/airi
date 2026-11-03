import type { AudioPlayback, PlaybackGroup, PlaybackReceipt } from '@proj-airi/pipelines-audio'

import { describe, expect, it, vi } from 'vitest'

import { createSerializedPlayback } from './serialized-playback'

function receipt(groupId: string): PlaybackReceipt {
  return { groupId, played: [], status: 'silent' }
}

function fakePlayback() {
  const calls: string[] = []
  const playback: AudioPlayback = {
    nowMs: () => 0,
    openGroup(label): PlaybackGroup {
      return {
        id: label,
        label,
        enqueue: async (clip) => {
          calls.push(clip.id)
          return 'ended'
        },
        finish: async () => receipt(label),
        stop: async () => receipt(label),
      }
    },
  }
  return { calls, playback }
}

function clip(id: string) {
  return { id, audio: new Blob([id]) }
}

describe('createSerializedPlayback', () => {
  it('holds the next group until the active group finishes', async () => {
    const { calls, playback } = fakePlayback()
    const serialized = createSerializedPlayback(playback)
    const first = serialized.openGroup('first')
    const second = serialized.openGroup('second')

    const firstEnqueue = first.enqueue(clip('a'))
    const secondEnqueue = second.enqueue(clip('b'))

    await vi.waitFor(() => expect(calls).toEqual(['a']))
    await first.finish()
    await secondEnqueue

    expect(calls).toEqual(['a', 'b'])
    await firstEnqueue
  })

  it('holds the next group until the active group stops', async () => {
    const { calls, playback } = fakePlayback()
    const serialized = createSerializedPlayback(playback)
    const first = serialized.openGroup('first')
    const second = serialized.openGroup('second')

    void first.enqueue(clip('a'))
    const secondEnqueue = second.enqueue(clip('b'))

    await vi.waitFor(() => expect(calls).toEqual(['a']))
    await first.stop({ fadeMs: 0 })
    await secondEnqueue

    expect(calls).toEqual(['a', 'b'])
  })

  it('keeps clips inside one group in their own order', async () => {
    const { calls, playback } = fakePlayback()
    const serialized = createSerializedPlayback(playback)
    const group = serialized.openGroup('one')

    await group.enqueue(clip('a'))
    await group.enqueue(clip('b'))

    expect(calls).toEqual(['a', 'b'])
  })
})
