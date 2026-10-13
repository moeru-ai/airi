import type { AgentTraceUpload, AgentTraceUploadSpan } from '../../../routes/agent-traces/schema'

import { describe, expect, it } from 'vitest'

import { toSpanRows } from './spans'

const io = 'ai.moeru.airi.io'

function upload(...spans: Array<Partial<AgentTraceUploadSpan>>): AgentTraceUpload {
  return {
    resource: { appSurface: 'electron', appVersion: '1.2.3' },
    spans: spans.map(span => ({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), name: 'Interaction turn', startTimeUnixMs: 1_000, endTimeUnixMs: 1_500, status: 'ok', attributes: {}, ...span })),
  }
}

describe('toSpanRows', () => {
  it('maps a turn span and moves its IDs to columns', () => {
    const { rows } = toSpanRows(upload({ attributes: { [`${io}.turn_id`]: 'round-1', 'gen_ai.conversation.id': 'session-1' } }))
    expect(rows).toEqual([expect.objectContaining({
      kind: 'turn',
      interactionId: 'round-1',
      sessionId: 'session-1',
      status: 'ok',
      startedAt: new Date(1_000),
      durationMs: 500,
      attributes: null,
      appSurface: 'electron',
      appVersion: '1.2.3',
    })])
  })

  it('keeps the allowlisted attributes of an LLM step and the tool columns of a tool span', () => {
    const { rows, droppedAttributes } = toSpanRows(upload(
      { name: 'LLM inference', attributes: { [`${io}.request_id`]: 'req-1', 'gen_ai.request.model': 'auto', [`${io}.llm.time_to_first_token`]: 120 } },
      { name: 'Tool execution', spanId: 'c'.repeat(16), status: 'error', attributes: { 'gen_ai.tool.name': 'weather', 'gen_ai.tool.call.id': 'call-1', 'error.type': 'TimeoutError' } },
    ))
    expect(droppedAttributes).toBe(0)
    expect(rows[0]).toMatchObject({ kind: 'llm_step', requestId: 'req-1', attributes: { 'gen_ai.request.model': 'auto', [`${io}.llm.time_to_first_token`]: 120 } })
    expect(rows[1]).toMatchObject({ kind: 'tool', toolName: 'weather', toolCallId: 'call-1', status: 'error', errorType: 'TimeoutError', attributes: null })
  })

  it('never stores content attributes, long strings, or attributes of another kind', () => {
    const transcript = 'Hello there'
    const { rows, droppedAttributes } = toSpanRows(upload(
      { name: 'Speech recognition', attributes: { [`${io}.asr.text`]: transcript, [`${io}.asr.abort`]: false } },
      { name: 'TTS synthesis', spanId: 'c'.repeat(16), attributes: { [`${io}.tts.text`]: transcript, [`${io}.tts.segment_id`]: 'x'.repeat(300), [`${io}.vad.aborted`]: true } },
      { name: 'Wake word', spanId: 'd'.repeat(16), attributes: { [`${io}.kws.text`]: 'hey airi', [`${io}.kws.tokens`]: ['hey'], [`${io}.kws.character_id`]: 'airi' } },
    ))
    expect(droppedAttributes).toBe(6)
    expect(JSON.stringify(rows)).not.toContain(transcript)
    expect(JSON.stringify(rows)).not.toContain('hey airi')
    expect(rows.map(row => row.attributes)).toEqual([{ [`${io}.asr.abort`]: false }, null, { [`${io}.kws.character_id`]: 'airi' }])
  })

  it('drops a span with an unknown name, and stores a cancelled span without an end as cancelled', () => {
    const { rows, droppedSpans } = toSpanRows(upload(
      { name: 'Something new' },
      { name: 'Audio playback', spanId: 'c'.repeat(16), endTimeUnixMs: null, attributes: { [`${io}.cancelled`]: true } },
    ))
    expect(droppedSpans).toBe(1)
    expect(rows).toEqual([expect.objectContaining({ kind: 'playback', status: 'cancelled', durationMs: null })])
  })
})
