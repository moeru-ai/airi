import { describe, expect, it } from 'vitest'

import { sameVisibleTracks, visibleTracksOf } from './visible-tracks'

describe('visibleTracksOf', () => {
  it('wants a track that appears after the user hid another track', () => {
    const hidden = new Set(['participants/user/input'])
    const before = visibleTracksOf(['participants/user/input', 'agents/agent/llm'], hidden)
    const after = visibleTracksOf(['participants/user/input', 'agents/agent/llm', 'participants/agent/playback'], hidden)

    expect(before).toEqual(['agents/agent/llm'])
    expect(after).toEqual(['agents/agent/llm', 'participants/agent/playback'])
    // The page sends the new value because it selects another set of tracks.
    expect(sameVisibleTracks(before, after)).toBe(false)
  })

  it('wants every track while none is hidden, and keeps a value that selects the same tracks', () => {
    expect(visibleTracksOf(['a', 'b'], new Set())).toBe('*')
    expect(sameVisibleTracks('*', '*')).toBe(true)
    expect(sameVisibleTracks(visibleTracksOf(['b', 'a', 'c'], new Set(['c'])), visibleTracksOf(['a', 'b', 'c'], new Set(['c'])))).toBe(true)
    expect(sameVisibleTracks(undefined, ['a'])).toBe(false)
  })
})
