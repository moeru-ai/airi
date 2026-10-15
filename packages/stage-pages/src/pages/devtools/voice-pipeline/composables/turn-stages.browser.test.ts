import type { IOSpan, IOTurn } from '@proj-airi/stage-shared'

import { IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'
import { describe, expect, it } from 'vitest'

import { bargeIns, endSilenceMs, SPEECH_INPUT_STOP_REASON, turnStages } from './turn-stages'

function span(fields: Pick<IOSpan, 'subsystem' | 'name' | 'startTs'> & Partial<IOSpan>): IOSpan {
  return { id: `${fields.name}-${fields.startTs}`, traceId: 'trace', meta: {}, ...fields }
}

/** A reply that plays two clips. The second one stops when the next turn starts to speak. */
const answered: IOTurn = {
  id: 'answered',
  startTs: 1000,
  spans: [
    span({ subsystem: IOSubsystems.Playback, name: IOSpanNames.AudioPlayback, startTs: 3000, endTs: 4000, meta: { text: 'First clip.' } }),
    span({ subsystem: IOSubsystems.VAD, name: IOSpanNames.VoiceActivityDetection, startTs: 1800, endTs: 2400 }),
    span({ subsystem: IOSubsystems.VAD, name: IOSpanNames.VoiceActivityDetection, startTs: 1100, endTs: 1500 }),
    span({ subsystem: IOSubsystems.VoiceInput, name: IOSpanNames.VoiceInput, startTs: 1000, endTs: 2800 }),
    span({ subsystem: IOSubsystems.Playback, name: IOSpanNames.AudioPlayback, startTs: 4000, endTs: 4700, meta: { text: 'Second clip.', interrupted: true, interrupt_reason: SPEECH_INPUT_STOP_REASON } }),
  ],
}
const interrupting: IOTurn = {
  id: 'interrupting',
  startTs: 4500,
  spans: [span({ subsystem: IOSubsystems.VoiceInput, name: IOSpanNames.VoiceInput, startTs: 4500 })],
}
/** An input that started while the second clip played but did not stop it. */
const earlier: IOTurn = {
  id: 'earlier',
  startTs: 4100,
  spans: [span({ subsystem: IOSubsystems.VoiceInput, name: IOSpanNames.VoiceInput, startTs: 4100 })],
}

describe('turnStages', () => {
  it('groups the spans by stage in start order', () => {
    const stages = turnStages(answered)

    expect(stages.voiceInput?.startTs).toBe(1000)
    expect(stages.speech.map(item => item.startTs)).toEqual([1100, 1800])
    expect(stages.playback.map(item => item.startTs)).toEqual([3000, 4000])
    expect(stages.recognition).toEqual([])
  })

  it('measures the silence from the last speech segment to the capture end', () => {
    expect(endSilenceMs(turnStages(answered), 3600)).toBe(1200)
    expect(endSilenceMs(turnStages(interrupting), 5000)).toBeUndefined()
  })
})

describe('bargeIns', () => {
  it('finds the clip that stopped early and the input that started while it played', () => {
    const [stopped, ...rest] = bargeIns(answered, [answered, earlier, interrupting])

    expect(rest).toEqual([])
    expect(stopped?.playback.meta.text).toBe('Second clip.')
    expect(stopped?.reason).toBe(SPEECH_INPUT_STOP_REASON)
    expect(stopped?.by?.turn).toBe(interrupting)
    expect(stopped?.stopMs).toBe(200)
  })

  it('leaves out the input of a clip that a control stopped', () => {
    const stoppedByControl: IOTurn = {
      ...answered,
      spans: answered.spans.map(item => item.meta.interrupted === true ? { ...item, meta: { ...item.meta, interrupt_reason: 'stop-button' } } : item),
    }
    const [stopped] = bargeIns(stoppedByControl, [stoppedByControl, interrupting])

    expect(stopped?.by).toBeUndefined()
    expect(stopped?.stopMs).toBeUndefined()
  })
})
