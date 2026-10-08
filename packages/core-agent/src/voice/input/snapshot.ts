import type { TranscriptSegment } from './transcript'

/** Model scores are evidence, not calibrated identity probabilities. */
export interface SpeakerEvidence {
  readonly revision: number
  readonly candidates: readonly { readonly speakerId: string, readonly score: number }[]
  readonly voicedMs: number
}

/** Selection fixes the data that a task reads and the dependencies of its writes. */
export interface SpeechSelection {
  readonly transcript: 'raw' | 'corrected'
  readonly speakers?: boolean
  readonly context?: readonly { readonly plugin: string, readonly key: string, readonly scope?: 'input' | 'target-segment' }[]
  /** Limits automatic corrections in corrected views. Manual corrections are always included. */
  readonly correctionPlugins?: readonly string[]
  readonly scope?: 'document' | { readonly kind: 'segment', readonly neighbors: number, readonly neighborTranscript?: 'raw' | 'corrected' }
}

/** Each snapshot belongs to one input. Segment selection includes explicit neighboring segments. */
export interface SpeechSnapshot {
  readonly inputId: string
  readonly sessionId: string
  readonly transcript: {
    readonly view: 'raw' | 'corrected'
    readonly revision: number
    readonly text: string
    readonly segments: readonly TranscriptSegment[]
    readonly targetSegmentId?: string
  }
  readonly speakers?: SpeakerEvidence
  readonly neighbors: readonly { readonly view: 'raw' | 'corrected', readonly segment: TranscriptSegment }[]
  readonly correctionPlugins: readonly string[]
  readonly context: readonly { readonly plugin: string, readonly key: string, readonly segmentId?: string, readonly revision: number, readonly value?: unknown }[]
}
