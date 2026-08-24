import { readonly, ref, shallowRef } from 'vue'

/** Lifecycle state of one recorded Hearing playground segment. */
export type HearingPlaygroundSegmentStatus = 'transcribing' | 'complete' | 'empty' | 'error'

/** A recorded playground utterance and the transcription state that belongs to it. */
export interface HearingPlaygroundSegment {
  /** Stable identity used to correlate asynchronous provider results. */
  id: number
  /** Audio sent to the provider. VAD-triggered recordings include retained speech padding. */
  recording?: Blob
  /** Final provider text. Empty while the request is pending or produced no text. */
  text: string
  /** User-facing failure details when transcription throws. */
  error?: string
  /** Current transcription state for this segment. */
  status: HearingPlaygroundSegmentStatus
}

interface HearingPlaygroundSegmentMetadata extends Record<string, unknown> {
  playgroundSegmentId: number
}

function segmentIdFrom(metadata: Record<string, unknown> | undefined): number | undefined {
  const id = metadata?.playgroundSegmentId
  return typeof id === 'number' ? id : undefined
}

/**
 * Keeps playground recordings and asynchronous transcription results correlated.
 * Empty and failed results remain visible so later text cannot shift onto earlier audio.
 */
export function useHearingPlaygroundSegments() {
  const current = shallowRef('')
  const segments = ref<HearingPlaygroundSegment[]>([])
  let nextSegmentId = 0

  function updateSegment(
    metadata: Record<string, unknown> | undefined,
    update: (segment: HearingPlaygroundSegment) => HearingPlaygroundSegment,
  ) {
    const segmentId = segmentIdFrom(metadata)
    if (segmentId === undefined)
      return

    segments.value = segments.value.map(segment => segment.id === segmentId ? update(segment) : segment)
  }

  function startRecording(recording: Blob): HearingPlaygroundSegmentMetadata {
    const id = ++nextSegmentId
    segments.value = [
      ...segments.value,
      { id, recording, text: '', status: 'transcribing' },
    ]
    return { playgroundSegmentId: id }
  }

  function finishRecording(metadata: Record<string, unknown> | undefined, text: string) {
    const finalText = text.trim()
    if (!finalText) {
      finishEmpty(metadata)
      return
    }

    updateSegment(metadata, segment => ({ ...segment, text: finalText, status: 'complete' }))
  }

  function finishEmpty(metadata: Record<string, unknown> | undefined) {
    updateSegment(metadata, segment => ({ ...segment, text: '', status: 'empty' }))
  }

  function finishError(metadata: Record<string, unknown> | undefined, error: string) {
    updateSegment(metadata, segment => ({ ...segment, error, status: 'error' }))
  }

  function replaceStreamingText(text: string) {
    current.value = text.trim()
  }

  function finishStreaming(text: string) {
    const finalText = text.trim() || current.value.trim()
    current.value = ''
    if (!finalText)
      return

    const id = ++nextSegmentId
    segments.value = [...segments.value, { id, text: finalText, status: 'complete' }]
  }

  function clear() {
    current.value = ''
    segments.value = []
  }

  return {
    current: readonly(current),
    segments: readonly(segments),
    startRecording,
    finishRecording,
    finishEmpty,
    finishError,
    replaceStreamingText,
    finishStreaming,
    clear,
  }
}
