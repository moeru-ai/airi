import type { PlaybackItem } from '../types'

import { describe, expect, it, vi } from 'vitest'

import { createPlaybackManager } from './playback-manager'

function createPlaybackItem(id: string, priority: number, intentId: string): PlaybackItem<unknown> {
  return {
    id,
    streamId: 'stream-1',
    intentId,
    segmentId: `${id}-segment`,
    sequence: 1,
    priority,
    text: `${id} text`,
    special: null,
    audio: { id },
    createdAt: Date.now(),
  }
}

describe('createPlaybackManager', () => {
  it.each(['stopByIntent', 'stopAll'])(
    'does not restart queued playback when stopping with %s',
    (method) => {
      const play = vi.fn((_item, signal) => new Promise<void>((resolve) => {
        signal.addEventListener('abort', () => resolve(), { once: true })
      }))
      const manager = createPlaybackManager({
        maxVoices: 1,
        overflowPolicy: 'queue',
        play,
      })

      manager.schedule(createPlaybackItem('active', 10, 'intent-1'))
      manager.schedule(createPlaybackItem('queued', 5, 'intent-2'))

      if (method === 'stopByIntent')
        manager.stopByIntent('intent-1', 'stop')
      else
        manager.stopAll('stop')

      expect(play).toHaveBeenCalledTimes(1)
    },
  )

  it('rejects lower-priority overflow items with steal-lowest-priority policy', () => {
    const play = vi.fn((_item, signal) => new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => resolve(), { once: true })
    }))
    const rejected: string[] = []
    const manager = createPlaybackManager({
      maxVoices: 1,
      overflowPolicy: 'steal-lowest-priority',
      play,
    })

    manager.onReject((event) => {
      rejected.push(event.item.id)
    })

    manager.schedule(createPlaybackItem('active', 10, 'intent-1'))
    manager.schedule(createPlaybackItem('lower', 5, 'intent-2'))

    expect(play).toHaveBeenCalledTimes(1)
    expect(rejected).toEqual(['lower'])
  })
})
