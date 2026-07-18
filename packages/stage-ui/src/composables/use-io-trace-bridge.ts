import type { Span } from '@opentelemetry/api'
import type { createSpeechPipeline } from '@proj-airi/pipelines-audio'

import { IOAttributes, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'
import { onScopeDispose } from 'vue'

import { activeTurnSpan, startSpan } from './use-io-tracer'

export function useIOTraceBridge(pipeline: ReturnType<typeof createSpeechPipeline>) {
  const cleanupFns: (() => void)[] = []

  const synthesisSpans = new Map<string, Span>()
  const playbackSpans = new Map<string, Span>()
  const segmentReasons = new Map<string, string>()

  cleanupFns.push(pipeline.on('onSegment', (segment) => {
    segmentReasons.set(segment.segmentId, segment.reason)
  }))

  cleanupFns.push(pipeline.on('onTtsRequest', (request) => {
    const ttsSynthesisSpan = startSpan(IOSpanNames.TTSSynthesis, activeTurnSpan.value, {
      [IOAttributes.Subsystem]: IOSubsystems.TTS,
      [IOAttributes.TTSSegmentId]: request.segmentId,
      [IOAttributes.TTSText]: request.text,
      [IOAttributes.TTSChunkReason]: segmentReasons.get(request.segmentId) ?? '',
    })
    segmentReasons.delete(request.segmentId)
    synthesisSpans.set(request.segmentId, ttsSynthesisSpan)
  }))

  cleanupFns.push(pipeline.on('onTtsResult', (result) => {
    const span = synthesisSpans.get(result.segmentId)
    if (span) {
      span.end()
      synthesisSpans.delete(result.segmentId)
    }
  }))

  cleanupFns.push(pipeline.on('onPlaybackStart', (event) => {
    const playbackSpan = startSpan(IOSpanNames.AudioPlayback, activeTurnSpan.value, {
      [IOAttributes.Subsystem]: IOSubsystems.Playback,
      [IOAttributes.TTSSegmentId]: event.item.segmentId,
      [IOAttributes.TTSText]: event.item.text,
    })
    playbackSpans.set(event.item.segmentId, playbackSpan)
  }))

  cleanupFns.push(pipeline.on('onPlaybackEnd', (event) => {
    const playbackSpan = playbackSpans.get(event.item.segmentId)
    if (playbackSpan) {
      playbackSpan.end()
      playbackSpans.delete(event.item.segmentId)
    }
  }))

  cleanupFns.push(pipeline.on('onPlaybackInterrupt', (event) => {
    const playbackSpan = playbackSpans.get(event.item.segmentId)
    if (playbackSpan) {
      playbackSpan.setAttribute(IOAttributes.TTSInterrupted, true)
      playbackSpan.setAttribute(IOAttributes.TTSInterruptReason, event.reason)
      playbackSpan.end()
      playbackSpans.delete(event.item.segmentId)
    }
  }))

  cleanupFns.push(pipeline.on('onIntentCancel', () => {
    for (const [segmentId, span] of synthesisSpans) {
      span.setAttribute(IOAttributes.TTSCanceled, true)
      span.end()
      synthesisSpans.delete(segmentId)
    }
    for (const [segmentId, span] of playbackSpans) {
      span.setAttribute(IOAttributes.TTSCanceled, true)
      span.end()
      playbackSpans.delete(segmentId)
    }
  }))

  onScopeDispose(() => {
    for (const cleanup of cleanupFns)
      cleanup()
  })
}
