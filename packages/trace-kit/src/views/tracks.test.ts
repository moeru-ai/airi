import { describe, expect, it } from 'vitest'

import { agentProfile } from '../profiles/agent'
import { voiceProfile } from '../profiles/voice'
import { readTimeline } from '../testing'
import { hashColor, trackSummary } from './tracks'

describe('track views', () => {
  it('gives a track without a color a hue outside the red range of failures', () => {
    const hues = Array.from({ length: 500 }, (_, index) => Number(/hsl\((\d+)/.exec(hashColor(`plugin:p/bots/b_${index}/planner`))?.[1]))
    expect(hues.every(hue => hue >= 25 && hue <= 324)).toBe(true)
    expect(hashColor('plugin:minecraft/bots/b_2/planner')).toBe('hsl(295 60% 55%)')
  })

  it('summarizes the items and the failures of a track', () => {
    const { state } = readTimeline([
      { type: 'span.begin', ts: 0, track: 'participants/user/asr', spanId: 'a1', name: 'asr' },
      { type: 'span.end', ts: 10, track: 'participants/user/asr', spanId: 'a1', status: 'error' },
      { type: 'span.begin', ts: 20, track: 'participants/user/asr', spanId: 'a2', name: 'asr' },
      { type: 'instant', ts: 5, track: 'conversations/c1/floor', name: 'floor.taken' },
    ], { profiles: [voiceProfile, agentProfile] })
    expect(trackSummary(state.tracks.get('participants/user/asr')!)).toEqual({ items: 2, failed: 1 })
    // A track without spans counts its instants.
    expect(trackSummary(state.tracks.get('conversations/c1/floor')!)).toEqual({ items: 1, failed: 0 })
  })
})
