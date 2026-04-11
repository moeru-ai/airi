import type { Span } from '@opentelemetry/api'
import type { createSpeechPipeline } from '@proj-airi/pipelines-audio'

import { IOAttrs, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'
import { onScopeDispose, watch } from 'vue'

import { activeTurnSpan, startSpan } from './use-io-tracer'

export function useIOTraceBridge(pipeline: ReturnType<typeof createSpeechPipeline>) {
  const cleanupFns: (() => void)[] = []

  const segmentSpans = new Map<string, Span>()
  const synthesisSpans = new Map<string, Span>()
  const playbackSpans = new Map<string, Span>()
  const segmentReasons = new Map<string, string>()

  let currentParent: Span | undefined
  let hadSegments = false

  const stopWatch = watch(activeTurnSpan, (newSpan) => {
    if (newSpan) {
      currentParent = newSpan
      hadSegments = false
    }
  }, { immediate: true })

  function tryCloseTurn() {
    if (hadSegments && segmentSpans.size === 0) {
      activeTurnSpan.value?.end()
      activeTurnSpan.value = undefined
    }
  }

  function closeSegment(segmentId: string) {
    const segSpan = segmentSpans.get(segmentId)
    if (segSpan) {
      segSpan.end()
      segmentSpans.delete(segmentId)
    }
  }

  cleanupFns.push(pipeline.on('onSegment', (segment) => {
    segmentReasons.set(segment.segmentId, segment.reason)
  }))

  cleanupFns.push(pipeline.on('onTtsRequest', (request) => {
    let ttsSegmentSpan = segmentSpans.get(request.segmentId)
    if (!ttsSegmentSpan) {
      hadSegments = true
      ttsSegmentSpan = startSpan(IOSpanNames.TTSSegment, currentParent, {
        [IOAttrs.Subsystem]: IOSubsystems.TTS,
        [IOAttrs.TTSSegmentId]: request.segmentId,
        [IOAttrs.TTSText]: request.text,
        [IOAttrs.TTSChunkReason]: segmentReasons.get(request.segmentId) ?? '',
      })
      segmentReasons.delete(request.segmentId)
      segmentSpans.set(request.segmentId, ttsSegmentSpan)
    }

    const ttsSynthesisSpan = startSpan(IOSpanNames.TTSSynthesis, ttsSegmentSpan, {
      [IOAttrs.Subsystem]: IOSubsystems.TTS,
      [IOAttrs.TTSSegmentId]: request.segmentId,
      [IOAttrs.TTSText]: request.text,
    })
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
    const segSpan = segmentSpans.get(event.item.segmentId)
    const playbackSpan = startSpan(IOSpanNames.AudioPlayback, segSpan, {
      [IOAttrs.Subsystem]: IOSubsystems.Playback,
      [IOAttrs.TTSSegmentId]: event.item.segmentId,
      [IOAttrs.TTSText]: event.item.text,
    })
    playbackSpans.set(event.item.segmentId, playbackSpan)
  }))

  cleanupFns.push(pipeline.on('onPlaybackEnd', (event) => {
    const playbackSpan = playbackSpans.get(event.item.segmentId)
    if (playbackSpan) {
      playbackSpan.end()
      playbackSpans.delete(event.item.segmentId)
    }
    closeSegment(event.item.segmentId)
    tryCloseTurn()
  }))

  cleanupFns.push(pipeline.on('onPlaybackInterrupt', (event) => {
    const playbackSpan = playbackSpans.get(event.item.segmentId)
    if (playbackSpan) {
      playbackSpan.setAttribute(IOAttrs.TTSInterrupted, true)
      playbackSpan.setAttribute(IOAttrs.TTSInterruptReason, event.reason)
      playbackSpan.end()
      playbackSpans.delete(event.item.segmentId)
    }
    closeSegment(event.item.segmentId)
    tryCloseTurn()
  }))

  cleanupFns.push(pipeline.on('onPlaybackReject', (event) => {
    closeSegment(event.item.segmentId)
    tryCloseTurn()
  }))

  cleanupFns.push(pipeline.on('onIntentCancel', () => {
    for (const [segmentId, span] of segmentSpans) {
      span.setAttribute(IOAttrs.TTSCanceled, true)
      span.end()
      segmentSpans.delete(segmentId)
    }
    for (const [segmentId, span] of synthesisSpans) {
      span.end()
      synthesisSpans.delete(segmentId)
    }
    for (const [segmentId, span] of playbackSpans) {
      span.end()
      playbackSpans.delete(segmentId)
    }
    tryCloseTurn()
  }))

  onScopeDispose(() => {
    stopWatch()
    for (const cleanup of cleanupFns)
      cleanup()
  })
}
