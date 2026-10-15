import type { IOTurn } from '@proj-airi/stage-shared'

import { IOEvents, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'

/**
 * The moments of one spoken turn, in milliseconds since the epoch. A missing field means the turn has no such moment yet.
 *
 * - `speechEndTs`: the end of the last speech segment that VAD found. Push to Talk has no VAD, so it is the capture end.
 * - `transcriptTs`: the end of the last speech recognition request that returned a transcript. A failed request has none.
 * - `firstTokenTs`: the first token of the reply.
 * - `firstAudioTs`: the start of the first reply audio.
 */
export interface VoiceTurnTiming {
  speechEndTs?: number
  transcriptTs?: number
  firstTokenTs?: number
  firstAudioTs?: number
  /** How the voice input settled, for example `committed`, `drafted`, or `cancelled`. */
  outcome?: string
}

/** The time from the end of speech to each later moment. Users feel these delays as the response time. */
export interface VoiceTurnLatency {
  transcriptMs?: number
  firstTokenMs?: number
  firstAudioMs?: number
}

function maxOf(values: readonly number[]) {
  return values.length ? Math.max(...values) : undefined
}

function minOf(values: readonly number[]) {
  return values.length ? Math.min(...values) : undefined
}

/** Tells if the turn started with speech. A typed turn has no voice input span. */
export function isSpokenTurn(turn: IOTurn) {
  return turn.spans.some(span => span.subsystem === IOSubsystems.VoiceInput)
}

/** Reads the speech input ID of a spoken turn from its voice input span. */
export function voiceInputIdOf(turn: IOTurn) {
  const id = turn.spans.find(span => span.name === IOSpanNames.VoiceInput)?.meta.id
  return typeof id === 'string' ? id : undefined
}

/** Reads the moments of a turn from the spans that the IO tracer recorded for it. */
export function voiceTurnTiming(turn: IOTurn): VoiceTurnTiming {
  const ended = (subsystem: string) => turn.spans.filter(span => span.subsystem === subsystem && span.endTs !== undefined).map(span => span.endTs!)
  const voiceInput = turn.spans.find(span => span.name === IOSpanNames.VoiceInput)

  return {
    speechEndTs: maxOf(ended(IOSubsystems.VAD)) ?? voiceInput?.events?.find(event => event.name === IOEvents.VoiceCaptureEnd)?.timeTs,
    transcriptTs: maxOf(turn.spans.filter(span => span.subsystem === IOSubsystems.ASR && span.endTs !== undefined && typeof span.meta.text === 'string').map(span => span.endTs!)),
    firstTokenTs: minOf(turn.spans.flatMap(span => span.subsystem === IOSubsystems.LLM && typeof span.meta.firstTokenTs === 'number' ? [span.meta.firstTokenTs] : [])),
    firstAudioTs: minOf(turn.spans.filter(span => span.subsystem === IOSubsystems.Playback).map(span => span.startTs)),
    outcome: typeof voiceInput?.meta.outcome === 'string' ? voiceInput.meta.outcome : undefined,
  }
}

/** Measures each later moment from the end of speech. Without a speech end, there is nothing to measure from. */
export function voiceTurnLatency(timing: VoiceTurnTiming): VoiceTurnLatency {
  const from = timing.speechEndTs
  if (from === undefined)
    return {}
  const since = (ts: number | undefined) => ts === undefined ? undefined : ts - from
  return {
    transcriptMs: since(timing.transcriptTs),
    firstTokenMs: since(timing.firstTokenTs),
    firstAudioMs: since(timing.firstAudioTs),
  }
}
