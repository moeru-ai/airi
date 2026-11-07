import type { TraceRecord } from '@proj-airi/trace-kit'

import { createRecordStamper } from '@proj-airi/trace-kit/testing'
import { describe, expect, it } from 'vitest'

import { completedSpansOf } from './trace-spans'

function records(): TraceRecord[] {
  const stamp = createRecordStamper({ source: 'tab:a', clock: 'mono:tab:a' })
  const track = 'participants/user/asr'
  return [
    stamp({ type: 'span.begin', ts: 10, track, spanId: 'done', name: 'asr', ids: { input: 'i1' } }),
    stamp({ type: 'span.begin', ts: 20, track, spanId: 'open', name: 'asr' }),
    stamp({ type: 'span.end', ts: 30, track, spanId: 'done', status: 'ok', attrs: { 'asr.text': 'hello' } }),
  ]
}

describe('completedSpansOf', () => {
  it('returns ended spans with merged attributes and drops duplicate records', () => {
    const list = records()

    const spans = completedSpansOf([...list, ...list])

    expect(spans).toEqual([{ spanId: 'done', name: 'asr', track: 'participants/user/asr', ids: { input: 'i1' }, attrs: { 'asr.text': 'hello' }, start: 10, end: 30, status: 'ok' }])
  })

  it('filters by span name', () => {
    expect(completedSpansOf(records(), 'tts')).toEqual([])
  })
})
