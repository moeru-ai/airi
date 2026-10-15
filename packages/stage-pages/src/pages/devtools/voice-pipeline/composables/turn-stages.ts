import type { IOSpan, IOTurn } from '@proj-airi/stage-shared'

import { IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'

/**
 * The spans of one turn, sorted by start time and grouped by pipeline stage.
 *
 * The IO tracer shortens attribute keys to their last part, so for example `meta.judgement` holds the end judgement.
 */
export interface TurnStages {
  voiceInput?: IOSpan
  /** Speech segments that VAD found. */
  speech: IOSpan[]
  recognition: IOSpan[]
  endJudgements: IOSpan[]
  rephrase: IOSpan[]
  llm: IOSpan[]
  synthesis: IOSpan[]
  playback: IOSpan[]
}

/** Groups the spans of a turn by stage. */
export function turnStages(turn: IOTurn): TurnStages {
  const spans = turn.spans.toSorted((a, b) => a.startTs - b.startTs)
  const of = (subsystem: string) => spans.filter(span => span.subsystem === subsystem)
  return {
    voiceInput: spans.find(span => span.name === IOSpanNames.VoiceInput),
    speech: of(IOSubsystems.VAD),
    recognition: of(IOSubsystems.ASR),
    endJudgements: of(IOSubsystems.EndJudge),
    rephrase: of(IOSubsystems.Rephrase),
    llm: of(IOSubsystems.LLM),
    synthesis: of(IOSubsystems.TTS),
    playback: of(IOSubsystems.Playback),
  }
}

/** The span duration in milliseconds, or `undefined` while it runs. */
export function spanMs(span: IOSpan) {
  return span.endTs === undefined ? undefined : span.endTs - span.startTs
}

/** A string attribute of a span, or `undefined` for another type. */
export function metaText(span: IOSpan | undefined, key: string) {
  const value = span?.meta[key]
  return typeof value === 'string' ? value : undefined
}

/** A number attribute of a span, or `undefined` for another type. */
export function metaNumber(span: IOSpan | undefined, key: string) {
  const value = span?.meta[key]
  return typeof value === 'number' ? value : undefined
}

/**
 * The stop reason of a clip that a new speech input stopped.
 * The speech input attempt of core-agent interrupts with this cause, in `packages/core-agent/src/voice/input/attempt.ts`.
 */
export const SPEECH_INPUT_STOP_REASON = 'speech-input'

/** One clip that stopped before its end, and the speech input that stopped it, when one did. */
export interface BargeIn {
  playback: IOSpan
  reason?: string
  /** The voice input that stopped the clip. */
  by?: { turn: IOTurn, input: IOSpan }
  /** From the start of that input to the end of the clip. It includes the fade. */
  stopMs?: number
}

/**
 * Finds the clips of `turn` that stopped early, and the speech input of another turn that stopped each one.
 *
 * Only a clip with the speech input stop reason has such an input. A clip stopped by a control, such as the stop
 * button, has none. An input interrupts the reply at its start, so the input is the last one that started before
 * the clip ended. The trace has no chat id, so an input of another chat that starts in the same fade can be chosen.
 */
export function bargeIns(turn: IOTurn, turns: readonly IOTurn[]): BargeIn[] {
  return turnStages(turn).playback.filter(span => span.meta.interrupted === true).map((playback) => {
    const reason = metaText(playback, 'interrupt_reason') || undefined
    const end = playback.endTs ?? Number.POSITIVE_INFINITY
    const inputs = reason === SPEECH_INPUT_STOP_REASON
      ? turns.flatMap((candidate) => {
          const input = candidate === turn ? undefined : turnStages(candidate).voiceInput
          return input && input.startTs >= playback.startTs && input.startTs <= end ? [{ turn: candidate, input }] : []
        })
      : []
    const by = inputs.toSorted((a, b) => b.input.startTs - a.input.startTs)[0]
    return {
      playback,
      reason,
      by,
      stopMs: by && playback.endTs !== undefined ? playback.endTs - by.input.startTs : undefined,
    }
  })
}

/**
 * The silence that ended the input: from the end of the last speech segment to the capture end.
 * Push to Talk ends at the release, so its silence can be short.
 */
export function endSilenceMs(stages: TurnStages, captureEndTs: number | undefined) {
  const lastSpeech = stages.speech.at(-1)?.endTs
  return lastSpeech === undefined || captureEndTs === undefined ? undefined : Math.max(0, captureEndTs - lastSpeech)
}

/** Formats a duration for the panels: milliseconds below one second, seconds above. */
export function formatMs(ms: number | undefined) {
  if (ms === undefined)
    return '—'
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`
}
