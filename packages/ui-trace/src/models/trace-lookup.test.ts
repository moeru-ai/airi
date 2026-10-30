import { agentProfile } from '@proj-airi/trace-kit/agent'
import { readTimeline } from '@proj-airi/trace-kit/testing'
import { voiceProfile } from '@proj-airi/trace-kit/voice'
import { describe, expect, it } from 'vitest'

import { spanFacts } from './trace-lookup'

function trace() {
  return readTimeline([
    { type: 'span.begin', ts: 0, track: 'participants/user/input', spanId: 'input', name: 'voice-input', ids: { input: 'i1' } },
    { type: 'span.end', ts: 400, track: 'participants/user/input', spanId: 'input', status: 'ok' },
    { type: 'span.begin', ts: 400, track: 'participants/user/asr', spanId: 'asr', name: 'asr', ids: { input: 'i1' }, links: [{ rel: 'caused-by', to: { spanId: 'input' } }] },
    { type: 'span.end', ts: 900, track: 'participants/user/asr', spanId: 'asr', status: 'error', reason: 'timeout' },
    { type: 'span.begin', ts: 900, track: 'agents/agent/llm', spanId: 'llm', name: 'chat', attrs: { 'gen_ai.usage.input_tokens': 120, 'gen_ai.usage.output_tokens': 30 } },
    { type: 'instant', ts: 950, track: 'agents/agent/llm', name: 'llm.first_chunk' },
  ], { profiles: [voiceProfile, agentProfile] })
}

describe('trace lookup', () => {
  it('describes a span the same way in every view', () => {
    const { state } = trace()
    const asr = state.spans.get('window:main/e1/asr')!
    const llm = state.spans.get('window:main/e1/llm')!
    expect(spanFacts(asr, state.tracks.get(asr.track))).toEqual({ activity: 'thinking', duration: '500 ms', status: 'error: timeout' })
    expect(spanFacts(llm, state.tracks.get(llm.track), 1900).duration).toBe('running 1.00 s')
    expect(spanFacts(llm, state.tracks.get(llm.track)).duration).toBe('running')
  })
})
