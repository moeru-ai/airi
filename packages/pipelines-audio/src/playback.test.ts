import { describe, expect, it, vi } from 'vitest'

import { Playback } from './index'

describe('playback', () => {
  it('releases readable audio when the playback driver cannot start', async () => {
    const cancelled = vi.fn()
    const playback = new Playback({ play: () => {
      throw new Error('Audio device unavailable')
    } })
    const group = playback.openGroup('voice')
    expect(await group.enqueue({ id: 'clip', audio: new ReadableStream({ cancel: cancelled }) })).toBe('failed')
    expect((await group.finish()).status).toBe('failed')
    expect(cancelled).toHaveBeenCalledOnce()
  })

  it('cancels readable audio when a group rejects or discards a clip', async () => {
    const cancelled = vi.fn()
    const rejected = new ReadableStream({ cancel: cancelled })
    const queued = new ReadableStream({ cancel: cancelled })
    const playback = new Playback({ play: () => ({ done: new Promise(() => {}), stop: async () => ({ throughMs: 0 }) }) })
    const group = playback.openGroup('voice')
    void group.enqueue({ id: 'active', audio: new Blob() })
    void group.enqueue({ id: 'queued', audio: queued })
    await group.stop({ fadeMs: 0 })
    expect(await group.enqueue({ id: 'late', audio: rejected })).toBe('stopped')
    expect(cancelled).toHaveBeenCalledTimes(2)
  })

  it('waits for actual silence while dropping queued clips and isolating other groups', async () => {
    const silence = Promise.withResolvers<{ throughMs: number }>()
    const ended = Promise.withResolvers<{ throughMs: number }>()
    const play = vi.fn(() => ({ done: ended.promise, stop: () => silence.promise }))
    const playback = new Playback({ play })
    const group = playback.openGroup('alice')
    const first = group.enqueue({ id: 'one', audio: new Blob(['a']) })
    const second = group.enqueue({ id: 'two', audio: new Blob(['b']) })
    await expect.poll(() => play.mock.calls.length).toBe(1)
    const stopping = group.stop({ fadeMs: 100 })
    let silent = false
    void stopping.then(() => {
      silent = true
    })
    expect(await second).toBe('stopped')
    expect(await group.enqueue({ id: 'late', audio: new Blob() })).toBe('stopped')
    expect(silent).toBe(false)
    const other = playback.openGroup('bob')
    void other.enqueue({ id: 'other', audio: new Blob(['c']) })
    await expect.poll(() => play.mock.calls.length).toBe(2)
    silence.resolve({ throughMs: 125 })
    expect(await stopping).toEqual({ groupId: group.id, status: 'silent', played: [{ clipId: 'one', throughMs: 125 }] })
    expect(await first).toBe('stopped')
    ended.resolve({ throughMs: 500 })
    expect((await other.finish()).status).toBe('silent')
  })
})
