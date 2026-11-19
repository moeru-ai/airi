import type { TraceRecord } from '@proj-airi/trace-kit'

import { agentProfile } from '@proj-airi/trace-kit/agent'
import { readTimeline } from '@proj-airi/trace-kit/testing'
import { spansOfLink } from '@proj-airi/trace-kit/views'
import { voiceProfile } from '@proj-airi/trace-kit/voice'
import { describe, expect, it } from 'vitest'

import { linkTargets, spanFacts } from './trace-lookup'

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

  it('finds the span or the item of a link to a record of this trace', () => {
    const { state, indexes, records } = trace()
    const refOf = (record: TraceRecord) => ({ source: record.source, epoch: record.epoch, seq: record.seq })
    const inputBegin = records.find(record => record.type === 'span.begin' && record.spanId === 'input')!
    const firstChunk = records.find(record => record.type === 'instant')!

    // Before, the panel used `spansOfLink` alone, which finds nothing for a record reference.
    expect(spansOfLink({ rel: 'caused-by', to: refOf(inputBegin) }, state, indexes)).toEqual([])
    expect(linkTargets({ rel: 'caused-by', to: refOf(inputBegin) }, state, indexes).spans.map(span => span.spanId)).toEqual(['input'])
    expect(linkTargets({ rel: 'caused-by', to: refOf(firstChunk) }, state, indexes)).toMatchObject({ spans: [], items: [{ kind: 'instant', label: 'llm.first_chunk' }] })
    expect(linkTargets({ rel: 'caused-by', to: { ...refOf(firstChunk), seq: 999 } }, state, indexes)).toEqual({ spans: [], items: [] })
  })
})
