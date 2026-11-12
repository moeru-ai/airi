import { describe, expect, it } from 'vitest'

import { readTimeline } from '.'
import { agentProfile } from '../profiles/agent'
import { voiceProfile } from '../profiles/voice'
import { VOICE_TURN, voiceTurnRecords } from './voice-turn'

describe('voice turn fixture', () => {
  it('reads into a timeline with every item kind of the tracer', () => {
    const { state } = readTimeline(voiceTurnRecords(), { profiles: [voiceProfile, agentProfile] })
    const spans = [...state.spans.values()]

    expect(spans).toHaveLength(12)
    expect(spans.filter(span => span.end === undefined).map(span => span.spanId)).toEqual(['llm-2'])
    expect(spans.find(span => span.spanId === 'asr-1')?.status).toBe('error')
    expect(state.tracks.get('participants/user/input')?.series.probability?.times).toHaveLength(165)
    expect(state.tracks.get('participants/agent/playback')?.series.level?.times.at(-1)).toBeLessThan(VOICE_TURN.playbackEnd)
    expect(state.tracks.get('participants/user/state')?.states.map(change => change.value)).toEqual(['idle', 'listening', 'speaking', 'waiting'])
  })
})
