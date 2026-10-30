import type { SpeechAudio, SpeechOutput, TurnRef } from '@proj-airi/core-agent'
import type { TraceAttributes, TraceSink, TraceSpan } from '@proj-airi/trace-kit'

import { errorMessageFrom } from '@moeru/std'
import { beginSpan, SeriesWriter, TraceEndReasons, trackPath } from '@proj-airi/trace-kit'
import { VoiceAttributes, VoiceIdKeys, VoiceNames, VoiceSeries, VoiceTracks } from '@proj-airi/trace-kit/voice'

import { levelOf } from '../libs/voice/input-level'
import { getTraceSink } from './use-trace'

/** The decoded audio of one synthesized segment: its duration, and its samples for the level waveform. */
export type DecodedAudio = Pick<AudioBuffer, 'duration' | 'numberOfChannels' | 'sampleRate' | 'getChannelData'>

/** One level for each window gives a 40 Hz waveform, the rate that the playback track keeps. */
const LEVEL_WINDOW_MS = 25

/** The level of each {@link LEVEL_WINDOW_MS} window of decoded audio. */
export function levelsOf(audio: DecodedAudio): Float32Array {
  const windowLength = Math.max(1, Math.round(audio.sampleRate * LEVEL_WINDOW_MS / 1000))
  const channels = Array.from({ length: audio.numberOfChannels }, (_, index) => audio.getChannelData(index))
  const length = channels[0]?.length ?? 0
  const levels = new Float32Array(Math.ceil(length / windowLength))
  for (let window = 0; window < levels.length; window++) {
    const from = window * windowLength
    levels[window] = levelOf(channels.map(channel => channel.subarray(from, from + windowLength)))
  }
  return levels
}

/** A traced output for one response. The owner calls `end` once when that response closes. */
export interface SpeechOutputTrace {
  readonly output: SpeechOutput
  end: () => void
}

function failSpan(span: TraceSpan, cause: unknown, ts?: number) {
  span.end({ status: 'error', message: errorMessageFrom(cause) ?? 'Speech output failed', ts })
}

/**
 * Records the speech output of one response, its synthesis requests, and its played clips.
 *
 * Every span is on a track of the agent `actor`, and carries the conversation and turn IDs of the response, so the
 * timeline joins it with the chat turn without a parent span.
 * Playback spans reuse the synthesis segment ID, so the timeline and audio tests can join both sides of one text segment.
 * Spans that are still open when the turn ends end as cancelled.
 *
 * The level of each synthesized segment comes from its decoded audio, one value for each {@link LEVEL_WINDOW_MS}. When
 * the segment stops playing, its levels go to the playback track from the playback start, so the viewer draws the
 * waveform of what played. A stopped segment writes only the levels up to its stop. Streamed speech has no decoded
 * segment, so it has no levels.
 */
export function traceSpeechOutput(turn: TurnRef, actor: string, output: SpeechOutput, decode: (audio: Blob) => Promise<DecodedAudio>, sink: TraceSink = getTraceSink()): SpeechOutputTrace {
  const ids = { [VoiceIdKeys.Actor]: actor, [VoiceIdKeys.Conversation]: turn.sessionId, [VoiceIdKeys.Turn]: turn.turnId }
  const outputSpan = beginSpan(sink, { track: trackPath(VoiceTracks.Output, { actor }), name: VoiceNames.SpeechOutput, ids })
  const open = new Set<TraceSpan>()
  const playing = new Map<string, { span: TraceSpan, startedAt: number }>()
  /** Levels of decoded segments by segment ID, until the segment plays. */
  const levels = new Map<string, Float32Array>()
  const levelSeries = new SeriesWriter(() => sink, { track: trackPath(VoiceTracks.Playback, { actor }), ids: { [VoiceIdKeys.Actor]: actor } })
  let ended = false

  /** Writes the levels of a played segment from its start, up to `until`. */
  function writeLevels(segmentId: string, startedAt: number, until: number) {
    const segment = levels.get(segmentId)
    levels.delete(segmentId)
    if (!segment)
      return
    for (let index = 0; index < segment.length; index++) {
      const time = startedAt + index * LEVEL_WINDOW_MS
      if (time > until)
        break
      levelSeries.push({ [VoiceSeries.Level]: segment[index]! }, time)
    }
    levelSeries.flush()
  }

  function start(track: string, name: string, attrs: TraceAttributes, segmentId?: string) {
    const span = beginSpan(sink, { track: trackPath(track, { actor }), name, ids: segmentId ? { ...ids, [VoiceIdKeys.Segment]: segmentId } : ids, attrs })
    open.add(span)
    return span
  }

  function finish(span: TraceSpan, options?: Parameters<TraceSpan['end']>[0]) {
    if (!open.delete(span))
      return
    span.end(options)
  }

  const callbacks: Pick<SpeechOutput, 'onPlaybackStart' | 'onPlaybackEnd'> = {
    onPlaybackStart: (clip) => {
      playing.set(clip.id, { span: start(VoiceTracks.Playback, VoiceNames.Playback, { [VoiceAttributes.TTSText]: clip.text }, clip.id), startedAt: sink.now() })
      output.onPlaybackStart?.(clip)
    },
    onPlaybackEnd: (clip, result) => {
      const entry = playing.get(clip.id)
      const span = entry?.span
      playing.delete(clip.id)
      if (entry)
        writeLevels(clip.id, entry.startedAt, sink.now())
      if (span && result.status === 'stopped') {
        finish(span, { status: 'cancelled', reason: result.reason ?? TraceEndReasons.Interrupted })
      }
      else if (span && result.status === 'failed') {
        open.delete(span)
        failSpan(span, result.reason)
      }
      else if (span) {
        finish(span)
      }

      output.onPlaybackEnd?.(clip, result)
    },
  }

  async function synthesize(synthesizeAudio: Extract<SpeechOutput, { synthesize: unknown }>['synthesize'], ...[request, signal]: Parameters<typeof synthesizeAudio>) {
    const span = start(VoiceTracks.TTS, VoiceNames.TTSRequest, {
      [VoiceAttributes.TTSText]: request.text,
      [VoiceAttributes.TTSChunkReason]: request.reason,
    }, request.segmentId)
    try {
      const audio = await synthesizeAudio(request, signal)
      const synthesizedAt = sink.now()
      if (!audio) {
        // An aborted request is a cancellation. Without an abort, the output has no audio for the text,
        // for example because speech is muted or the character has no speech provider.
        finish(span, signal.aborted ? { status: 'cancelled', reason: TraceEndReasons.Aborted, ts: synthesizedAt } : { reason: TraceEndReasons.NoAudio, ts: synthesizedAt })
        return audio
      }

      // Playback must not wait for tracing. The span keeps its synthesis end time while the duration decodes.
      // It leaves the open set now, so a turn that ends during decoding does not mark finished synthesis as cancelled.
      open.delete(span)
      void decode(audio)
        .then((buffer) => {
          if (request.segmentId && levelSeries.wanted())
            levels.set(request.segmentId, levelsOf(buffer))
          span.end({ ts: synthesizedAt, attrs: { [VoiceAttributes.TTSAudioDurationMs]: buffer.duration * 1000 } })
        })
        .catch((cause) => {
          console.warn('Could not measure synthesized speech duration', cause)
          span.end({ ts: synthesizedAt })
        })
      return audio
    }
    catch (cause) {
      open.delete(span)
      failSpan(span, cause)
      throw cause
    }
  }

  async function stream(streamAudio: Extract<SpeechOutput, { stream: unknown }>['stream'], ...[text, signal]: Parameters<typeof streamAudio>) {
    const span = start(VoiceTracks.TTS, VoiceNames.TTSRequest, {})
    let spoken = ''
    try {
      const audio = await streamAudio(text, signal)
      // Cancellation skips flush. The turn end closes this span in that case.
      return audio.pipeThrough(new TransformStream<SpeechAudio, SpeechAudio>({
        transform(part, controller) {
          spoken += part.text ?? ''
          controller.enqueue(part)
        },
        flush() {
          finish(span, { attrs: { [VoiceAttributes.TTSText]: spoken } })
        },
      }))
    }
    catch (cause) {
      open.delete(span)
      failSpan(span, cause)
      throw cause
    }
  }

  const traced: SpeechOutput = 'synthesize' in output
    ? { ...output, ...callbacks, synthesize: (request, signal) => synthesize(output.synthesize, request, signal) }
    : { ...output, ...callbacks, stream: (text, signal) => stream(output.stream, text, signal) }

  return {
    output: traced,
    end() {
      if (ended)
        return

      ended = true
      for (const span of open)
        span.end({ status: 'cancelled', reason: TraceEndReasons.Aborted })
      open.clear()
      playing.clear()
      levels.clear()
      outputSpan.end()
    },
  }
}
