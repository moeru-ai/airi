import { describe, expect, it } from 'vitest'

import { createVideoNotifyGate, normalizeVideoTitle } from './video-notify'

function report(videoId: string, title: string) {
  return { url: `https://example.com/watch?v=${videoId}`, videoId, title }
}

describe('normalizeVideoTitle', () => {
  it('removes the notification count and the YouTube suffix of the page title', () => {
    expect(normalizeVideoTitle('(3) Song - YouTube')).toBe('Song')
  })

  it('keeps a title without decorations', () => {
    expect(normalizeVideoTitle('Part 1 (Director\'s Cut)')).toBe('Part 1 (Director\'s Cut)')
  })
})

describe('createVideoNotifyGate', () => {
  it('notifies a video after the same title arrives twice', () => {
    const gate = createVideoNotifyGate()

    expect(gate.shouldNotify(report('a', 'Song A'))).toBe(false)
    expect(gate.shouldNotify(report('a', 'Song A'))).toBe(true)
  })

  it('notifies a video only once', () => {
    const gate = createVideoNotifyGate()
    gate.shouldNotify(report('a', 'Song A'))
    gate.shouldNotify(report('a', 'Song A'))

    expect(gate.shouldNotify(report('a', 'Song A'))).toBe(false)
  })

  it('ignores reports that carry a new video id with the previous title', () => {
    const gate = createVideoNotifyGate()
    gate.shouldNotify(report('a', 'Song A'))
    gate.shouldNotify(report('a', 'Song A'))

    expect(gate.shouldNotify(report('b', 'Song A'))).toBe(false)
    expect(gate.shouldNotify(report('b', 'Song A'))).toBe(false)
    expect(gate.shouldNotify(report('b', 'Song B'))).toBe(false)
    expect(gate.shouldNotify(report('b', 'Song B'))).toBe(true)
  })

  it('ignores a stale page title of the previous video', () => {
    const gate = createVideoNotifyGate()
    gate.shouldNotify(report('a', 'Song'))
    gate.shouldNotify(report('a', 'Song'))

    expect(gate.shouldNotify(report('b', '(3) Song - YouTube'))).toBe(false)
    expect(gate.shouldNotify(report('b', '(3) Song - YouTube'))).toBe(false)
  })

  it('notifies a new title that contains the previous title', () => {
    const gate = createVideoNotifyGate()
    gate.shouldNotify(report('a', 'Part 1'))
    gate.shouldNotify(report('a', 'Part 1'))

    expect(gate.shouldNotify(report('b', 'Part 1 (Director\'s Cut)'))).toBe(false)
    expect(gate.shouldNotify(report('b', 'Part 1 (Director\'s Cut)'))).toBe(true)
  })

  it('keeps the pending title of another tab after one video notifies', () => {
    const gate = createVideoNotifyGate()
    gate.shouldNotify(report('a', 'Song A'))
    gate.shouldNotify(report('b', 'Song B'))

    expect(gate.shouldNotify(report('a', 'Song A'))).toBe(true)
    expect(gate.shouldNotify(report('b', 'Song B'))).toBe(true)
  })
})
