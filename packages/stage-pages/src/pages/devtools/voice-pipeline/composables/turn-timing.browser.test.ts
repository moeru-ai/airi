import type { IOSpan, IOTurn } from '@proj-airi/stage-shared'

import { IOEvents, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'
import { describe, expect, it } from 'vitest'

import { isSpokenTurn, voiceInputIdOf, voiceTurnLatency, voiceTurnTiming } from './turn-timing'

function span(fields: Pick<IOSpan, 'subsystem' | 'name' | 'startTs'> & Partial<IOSpan>): IOSpan {
  return { id: `${fields.name}-${fields.startTs}`, traceId: 'trace', meta: {}, ...fields }
}

/** A spoken turn: two speech segments, a final transcript, a reply, and two audio clips. */
const spoken: IOTurn = {
  id: 'trace',
  startTs: 1000,
  spans: [
    span({ subsystem: IOSubsystems.VAD, name: IOSpanNames.VoiceActivityDetection, startTs: 1100, endTs: 1500 }),
    span({ subsystem: IOSubsystems.VAD, name: IOSpanNames.VoiceActivityDetection, startTs: 1800, endTs: 2400 }),
    span({ subsystem: IOSubsystems.ASR, name: IOSpanNames.SpeechRecognition, startTs: 1100, endTs: 2700, meta: { text: '你好' } }),
    span({ subsystem: IOSubsystems.VoiceInput, name: IOSpanNames.VoiceInput, startTs: 1000, endTs: 2800, meta: { outcome: 'committed', id: 'input-1' } }),
    span({ subsystem: IOSubsystems.LLM, name: IOSpanNames.LLMInference, startTs: 2900, endTs: 4000, meta: { firstTokenTs: 3300 } }),
    span({ subsystem: IOSubsystems.Playback, name: IOSpanNames.AudioPlayback, startTs: 4100, endTs: 5000 }),
    span({ subsystem: IOSubsystems.Playback, name: IOSpanNames.AudioPlayback, startTs: 3900, endTs: 4100 }),
  ],
}

describe('voiceTurnTiming', () => {
  it('measures the reply from the end of the last speech segment', () => {
    const timing = voiceTurnTiming(spoken)

    expect(timing).toEqual({ speechEndTs: 2400, transcriptTs: 2700, firstTokenTs: 3300, firstAudioTs: 3900, outcome: 'committed' })
    expect(voiceTurnLatency(timing)).toEqual({ transcriptMs: 300, firstTokenMs: 900, firstAudioMs: 1500 })
  })

  it('leaves out the moments that a turn has not reached', () => {
    const listening: IOTurn = { id: 'trace', startTs: 1000, spans: [spoken.spans[0]!] }

    expect(voiceTurnLatency(voiceTurnTiming(listening))).toEqual({ transcriptMs: undefined, firstTokenMs: undefined, firstAudioMs: undefined })
    expect(isSpokenTurn(listening)).toBe(false)
    expect(isSpokenTurn(spoken)).toBe(true)
  })

  // Codex review on PR #30: Push to Talk runs no VAD, so its latency columns were always empty.
  it('measures a Push to Talk turn from the end of its capture', () => {
    const captureEnd = { name: IOEvents.VoiceCaptureEnd, timeTs: 2500, meta: {} }
    const pushToTalk: IOTurn = {
      id: 'trace',
      startTs: 1000,
      spans: spoken.spans.slice(2).map(item => item.name === IOSpanNames.VoiceInput ? { ...item, events: [captureEnd] } : item),
    }

    expect(voiceTurnTiming(pushToTalk).speechEndTs).toBe(2500)
    // VAD finds the speech end inside the capture, so it wins when it exists.
    expect(voiceTurnTiming({ ...pushToTalk, spans: [...spoken.spans.slice(0, 2), ...pushToTalk.spans] }).speechEndTs).toBe(2400)
  })

  // Codex review on PR #30: a failed recognition request still showed a transcript time.
  it('takes no transcript time from a recognition request that returned no text', () => {
    const failed: IOTurn = {
      ...spoken,
      spans: spoken.spans.map(item => item.subsystem === IOSubsystems.ASR ? { ...item, meta: {} } : item),
    }

    expect(voiceTurnTiming(failed).transcriptTs).toBeUndefined()
  })

  it('measures nothing without a speech end, as for a typed turn', () => {
    const typed: IOTurn = { id: 'trace', startTs: 2900, spans: spoken.spans.slice(4) }

    expect(voiceTurnLatency(voiceTurnTiming(typed))).toEqual({})
  })
})

describe('voiceInputIdOf', () => {
  it('reads the speech input of a spoken turn, and nothing for a typed turn', () => {
    expect(voiceInputIdOf(spoken)).toBe('input-1')
    expect(voiceInputIdOf({ id: 'trace', startTs: 2900, spans: spoken.spans.slice(4) })).toBeUndefined()
  })
})
