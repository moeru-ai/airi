import type { TraceRecordInput } from '../core/types'

import { describe, expect, it } from 'vitest'

import { ATTR_GEN_AI_USAGE_INPUT_TOKENS, ATTR_GEN_AI_USAGE_OUTPUT_TOKENS } from '../conventions'
import { agentProfile } from '../profiles/agent'
import { voiceProfile } from '../profiles/voice'
import { createRecordStamper, readTimeline } from '../testing'
import { findItem, itemOfRecord, relatedSpanKeys, spansOfLink, spanTokens } from './lookup'

function timelineOf(inputs: TraceRecordInput[]) {
  return readTimeline(inputs, { profiles: [voiceProfile, agentProfile] })
}

function trace() {
  return timelineOf([
    { type: 'span.begin', ts: 0, track: 'participants/user/input', spanId: 'input', name: 'voice-input', ids: { input: 'i1' } },
    { type: 'span.end', ts: 400, track: 'participants/user/input', spanId: 'input', status: 'ok' },
    { type: 'span.begin', ts: 400, track: 'participants/user/asr', spanId: 'asr', name: 'asr', ids: { input: 'i1' }, links: [{ rel: 'caused-by', to: { spanId: 'input' } }] },
    { type: 'span.end', ts: 900, track: 'participants/user/asr', spanId: 'asr', status: 'error', reason: 'timeout' },
    { type: 'span.begin', ts: 900, track: 'agents/agent/llm', spanId: 'llm', name: 'chat', attrs: { [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: 120, [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: 30 } },
    { type: 'instant', ts: 950, track: 'agents/agent/llm', name: 'llm.first_chunk' },
  ])
}

describe('trace lookup', () => {
  it('finds the spans of a link by span ID and by domain ID', () => {
    const { state, indexes } = trace()
    expect(spansOfLink({ rel: 'caused-by', to: { spanId: 'input' } }, state, indexes).map(span => span.name)).toEqual(['voice-input'])
    expect(spansOfLink({ rel: 'follows-from', to: { key: 'input', id: 'i1' } }, state, indexes).map(span => span.name)).toEqual(['voice-input', 'asr'])
    expect(spansOfLink({ rel: 'caused-by', to: { spanId: 'missing' } }, state, indexes)).toEqual([])
  })

  it('keys the item of a record like the timeline does', () => {
    const { state } = trace()
    const stamp = createRecordStamper()
    const span = itemOfRecord(stamp({ type: 'span.end', ts: 0, track: 'agents/agent/llm', spanId: 'llm', status: 'ok' }))
    expect(span).toEqual({ kind: 'span', key: 'window:main/e1/llm' })
    expect(findItem(state, span!).span?.name).toBe('chat')

    const instantKey = [...state.tracks.get('agents/agent/llm')!.instants][0]!.key
    expect(findItem(state, { kind: 'instant', key: instantKey })).toMatchObject({ instant: { name: 'llm.first_chunk' }, track: { path: 'agents/agent/llm' } })
  })

  it('counts the tokens of a model span', () => {
    const { state } = trace()
    const asr = state.spans.get('window:main/e1/asr')!
    const llm = state.spans.get('window:main/e1/llm')!
    expect(spanTokens(llm)).toBe(150)
    expect(spanTokens(asr)).toBe(0)
  })

  it('relates spans by links and narrow IDs, not by the conversation', () => {
    const { state } = timelineOf([
      { type: 'span.begin', ts: 0, track: 'participants/user/input', spanId: 'input', name: 'voice-input', ids: { input: 't1', conversation: 's' } },
      { type: 'span.begin', ts: 5, track: 'agents/agent/turn', spanId: 'turn', name: 'chat-turn', ids: { turn: 't1', conversation: 's' }, links: [{ rel: 'caused-by', to: { key: 'input', id: 't1' } }] },
      { type: 'span.begin', ts: 6, track: 'agents/agent/turn', spanId: 'other', name: 'chat-turn', ids: { turn: 't2', conversation: 's' } },
    ])

    const related = relatedSpanKeys(state, state.spans.get('window:main/e1/turn')!)

    expect(related.has('window:main/e1/input')).toBe(true)
    expect(related.has('window:main/e1/other')).toBe(false)
  })
})
