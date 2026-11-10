import type { PlaybackItem } from '../types'

import { describe, expect, it, vi } from 'vitest'

import { createPlaybackManager } from './playback-manager'

function createPlaybackItem(id: string, priority: number, intentId: string, ownerId?: string): PlaybackItem<unknown> {
  return {
    id,
    streamId: 'stream-1',
    intentId,
    segmentId: `${id}-segment`,
    sequence: 1,
    ownerId,
    priority,
    text: `${id} text`,
    special: null,
    audio: { id },
    createdAt: Date.now(),
  }
}

describe('createPlaybackManager', () => {
  it('does not start queued playback when stopping all playback', () => {
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
    manager.stopAll('stop')

    expect(play).toHaveBeenCalledTimes(1)
  })

  it('starts the next queued intent once after stopping another intent', () => {
    const play = vi.fn((_item, signal) => new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => resolve(), { once: true })
    }))
    const manager = createPlaybackManager({
      maxVoices: 1,
      overflowPolicy: 'queue',
      play,
    })
    const interrupted: string[] = []
    manager.onInterrupt(event => interrupted.push(event.item.id))

    manager.schedule(createPlaybackItem('active', 10, 'intent-1'))
    manager.schedule(createPlaybackItem('queued', 5, 'intent-2'))
    manager.stopByIntent('intent-1', 'stop')

    expect(interrupted).toEqual(['active'])
    expect(play).toHaveBeenCalledTimes(2)
    expect(play).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'queued' }), expect.any(AbortSignal))
  })

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

  it('rejects equal-priority overflow items with steal-lowest-priority policy', () => {
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
    manager.schedule(createPlaybackItem('equal', 10, 'intent-2'))

    expect(play).toHaveBeenCalledTimes(1)
    expect(rejected).toEqual(['equal'])
  })

  it('rejects an owner-overflow item after stealing a different-owner victim with steal-oldest', () => {
    const play = vi.fn((_item, signal) => new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => resolve(), { once: true })
    }))
    const rejected: string[] = []
    const manager = createPlaybackManager({
      maxVoices: 2,
      maxVoicesPerOwner: 1,
      overflowPolicy: 'steal-oldest',
      ownerOverflowPolicy: 'reject',
      play,
    })

    manager.onReject((event) => {
      rejected.push(event.item.id)
    })

    manager.schedule(createPlaybackItem('b', 9, 'intent-2', 'owner-y'))
    manager.schedule(createPlaybackItem('a', 10, 'intent-1', 'owner-x'))
    manager.schedule(createPlaybackItem('a2', 8, 'intent-3', 'owner-x'))

    expect(play).toHaveBeenCalledTimes(2)
    expect(rejected).toEqual(['a2'])
  })

  it('rejects an owner-overflow item after stealing a lower-priority victim with steal-lowest-priority', () => {
    const play = vi.fn((_item, signal) => new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => resolve(), { once: true })
    }))
    const rejected: string[] = []
    const manager = createPlaybackManager({
      maxVoices: 2,
      maxVoicesPerOwner: 1,
      overflowPolicy: 'steal-lowest-priority',
      ownerOverflowPolicy: 'reject',
      play,
    })

    manager.onReject((event) => {
      rejected.push(event.item.id)
    })

    manager.schedule(createPlaybackItem('a', 10, 'intent-1', 'owner-x'))
    manager.schedule(createPlaybackItem('b', 1, 'intent-2', 'owner-y'))
    manager.schedule(createPlaybackItem('a2', 5, 'intent-3', 'owner-x'))

    expect(play).toHaveBeenCalledTimes(2)
    expect(rejected).toEqual(['a2'])
  })

  it('steals the oldest item of the same owner on owner-overflow', () => {
    const play = vi.fn((_item, signal) => new Promise<void>((resolve) => {
      signal.addEventListener('abort', () => resolve(), { once: true })
    }))
    const manager = createPlaybackManager({
      maxVoices: 2,
      maxVoicesPerOwner: 1,
      overflowPolicy: 'queue',
      ownerOverflowPolicy: 'steal-oldest',
      play,
    })
    const interrupted: string[] = []
    manager.onInterrupt(event => interrupted.push(event.item.id))

    manager.schedule(createPlaybackItem('a', 10, 'intent-1', 'owner-x'))
    manager.schedule(createPlaybackItem('b', 9, 'intent-2', 'owner-y'))
    manager.schedule(createPlaybackItem('a2', 8, 'intent-3', 'owner-x'))

    expect(interrupted).toEqual(['a'])
    expect(play).toHaveBeenCalledTimes(3)
    expect(play).toHaveBeenNthCalledWith(3, expect.objectContaining({ id: 'a2' }), expect.any(AbortSignal))
  })

  it('does not drain the queue while stealing an owner-overflow playback slot', async () => {
    const resolveMap = new Map<string, () => void>()
    const play = vi.fn((item: PlaybackItem<unknown>, signal) => new Promise<void>((resolve) => {
      resolveMap.set(item.id, () => resolve())

      if (!signal.aborted) {
        signal.addEventListener('abort', () => resolve(), { once: true })
      }
    }))
    const manager = createPlaybackManager({
      maxVoices: 2,
      maxVoicesPerOwner: 1,
      overflowPolicy: 'queue',
      ownerOverflowPolicy: 'steal-oldest',
      play,
    })

    manager.schedule(createPlaybackItem('a', 10, 'intent-1', 'owner-x'))
    manager.schedule(createPlaybackItem('d', 10, 'intent-2', 'owner-y'))
    manager.schedule(createPlaybackItem('e', 5, 'intent-3', 'owner-z'))
    manager.schedule(createPlaybackItem('a2', 9, 'intent-4', 'owner-x'))

    // The stolen slot goes to a2. Queued e must wait for a slot that no steal reuses.
    expect(play.mock.calls.map(([item]) => item.id)).toEqual(['a', 'd', 'a2'])

    resolveMap.get('d')?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(play.mock.calls.map(([item]) => item.id)).toEqual(['a', 'd', 'a2', 'e'])
  })

  // https://github.com/moeru-ai/airi/pull/2740
  // ROOT CAUSE:
  //
  // Finalization deleted active playback by item ID alone. An interrupted promise
  // could finish after that ID was reused and delete the replacement playback.
  // Finalization must match the active entry, not only its reusable item ID.
  it('issue #2740: ignores completion from an interrupted playback after its ID is reused', async () => {
    const completions: Array<() => void> = []
    const play = vi.fn((_item: PlaybackItem<unknown>, _signal: AbortSignal) => new Promise<void>((resolve) => {
      // Playback can finish asynchronously after an abort request.
      completions.push(resolve)
    }))
    const ended = vi.fn()
    const manager = createPlaybackManager({ maxVoices: 1, overflowPolicy: 'queue', play })
    manager.onEnd(ended)

    manager.schedule(createPlaybackItem('reused', 10, 'old-intent'))
    manager.stopByIntent('old-intent')
    manager.schedule(createPlaybackItem('reused', 10, 'new-intent'))
    manager.schedule(createPlaybackItem('queued', 5, 'other-intent'))

    completions[0]!()
    await Promise.resolve()
    await Promise.resolve()

    expect(ended).not.toHaveBeenCalled()
    expect(play.mock.calls.map(([item]) => item.intentId)).toEqual(['old-intent', 'new-intent'])
    expect(play.mock.calls[1]![1].aborted).toBe(false)

    completions[1]!()
    await Promise.resolve()
    await Promise.resolve()

    expect(ended).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ item: expect.objectContaining({ intentId: 'new-intent' }) }))
    expect(play.mock.calls.map(([item]) => item.intentId)).toEqual(['old-intent', 'new-intent', 'other-intent'])
  })
})
