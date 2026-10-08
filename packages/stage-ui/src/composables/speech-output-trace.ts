import type { Span } from '@opentelemetry/api'
import type { SpeechAudio, SpeechOutput, TurnRef } from '@proj-airi/core-agent'

import { errorMessageFrom } from '@moeru/std'
import { SpanStatusCode } from '@opentelemetry/api'
import { IOAttributes, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'

import { activeTurnSpan, startSpan } from './use-io-tracer'

/** A traced output for one response. The owner calls `end` once when that response closes. */
export interface SpeechOutputTrace {
  readonly output: SpeechOutput
  end: () => void
}

function failSpan(span: Span, cause: unknown) {
  span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessageFrom(cause) ?? 'Speech output failed' })
}

/**
 * Records a speech turn, its synthesis requests, and its played clips.
 *
 * Synthesis and playback spans are children of the turn span. Playback spans reuse the synthesis
 * segment ID, so the devtools timeline and audio tests can join both sides of one text segment.
 * Spans that are still open when the turn ends are marked as canceled.
 */
export function traceSpeechOutput(turn: TurnRef, output: SpeechOutput, decode: (audio: Blob) => Promise<Pick<AudioBuffer, 'duration'>>): SpeechOutputTrace {
  const turnSpan = startSpan(IOSpanNames.SpeechTurn, activeTurnSpan.value, { [IOAttributes.TurnId]: turn.turnId })
  const open = new Set<Span>()
  const playing = new Map<string, Span>()
  let ended = false

  function start(name: string, attributes: Record<string, string>) {
    const span = startSpan(name, turnSpan, { [IOAttributes.TurnId]: turn.turnId, ...attributes })
    open.add(span)
    return span
  }

  function finish(span: Span, endTime?: number) {
    if (!open.delete(span))
      return

    span.end(endTime)
  }

  const callbacks: Pick<SpeechOutput, 'onPlaybackStart' | 'onPlaybackEnd'> = {
    onPlaybackStart: (clip) => {
      playing.set(clip.id, start(IOSpanNames.AudioPlayback, {
        [IOAttributes.Subsystem]: IOSubsystems.Playback,
        [IOAttributes.TTSSegmentId]: clip.id,
        [IOAttributes.TTSText]: clip.text,
      }))
      output.onPlaybackStart?.(clip)
    },
    onPlaybackEnd: (clip, result) => {
      const span = playing.get(clip.id)
      playing.delete(clip.id)
      if (span && result.status === 'stopped') {
        span.setAttribute(IOAttributes.TTSInterrupted, true)
        span.setAttribute(IOAttributes.TTSInterruptReason, result.reason ?? '')
      }
      if (span && result.status === 'failed')
        failSpan(span, result.reason)
      if (span)
        finish(span)

      output.onPlaybackEnd?.(clip, result)
    },
  }

  async function synthesize(synthesizeAudio: Extract<SpeechOutput, { synthesize: unknown }>['synthesize'], ...[request, signal]: Parameters<typeof synthesizeAudio>) {
    const span = start(IOSpanNames.TTSSynthesis, {
      [IOAttributes.Subsystem]: IOSubsystems.TTS,
      [IOAttributes.TTSSegmentId]: request.segmentId,
      [IOAttributes.TTSText]: request.text,
      [IOAttributes.TTSChunkReason]: request.reason,
    })
    try {
      const audio = await synthesizeAudio(request, signal)
      const synthesizedAt = Date.now()
      if (!audio) {
        span.setAttribute(IOAttributes.TTSCanceled, true)
        finish(span, synthesizedAt)
        return audio
      }

      // Playback must not wait for tracing. The span keeps its synthesis end time while the duration decodes.
      // It leaves the open set now, so a turn that ends during decoding does not mark finished synthesis as canceled.
      open.delete(span)
      void decode(audio)
        .then(buffer => span.setAttribute(IOAttributes.TTSAudioDurationMs, buffer.duration * 1000))
        .catch(cause => console.warn('Could not measure synthesized speech duration', cause))
        .finally(() => span.end(synthesizedAt))
      return audio
    }
    catch (cause) {
      failSpan(span, cause)
      finish(span)
      throw cause
    }
  }

  async function stream(streamAudio: Extract<SpeechOutput, { stream: unknown }>['stream'], ...[text, signal]: Parameters<typeof streamAudio>) {
    const span = start(IOSpanNames.TTSSynthesis, { [IOAttributes.Subsystem]: IOSubsystems.TTS })
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
          span.setAttribute(IOAttributes.TTSText, spoken)
          finish(span)
        },
      }))
    }
    catch (cause) {
      failSpan(span, cause)
      finish(span)
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
      for (const span of open) {
        span.setAttribute(IOAttributes.TTSCanceled, true)
        span.end()
      }
      open.clear()
      playing.clear()
      turnSpan.end()
    },
  }
}
