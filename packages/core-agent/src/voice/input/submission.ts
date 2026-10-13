import type { PcmBlock } from '@proj-airi/pipelines-audio'

import type { SpeakerEvidence, SpeechSnapshot } from './snapshot'
import type { TranscriptionEvent, TranscriptPatch, TranscriptSnapshot } from './transcript'

/**
 * Terms that one request asks the recognizer to prefer, for example names already in the conversation.
 *
 * A provider without a bias feature ignores it. The bias never changes text after recognition.
 */
export interface TranscriptionBias {
  /** Written forms, most relevant first. Providers cut the list to their own limit. */
  readonly phrases: readonly string[]
}

/**
 * A provider request consumes PCM and produces transcription concurrently.
 *
 * The PCM stream closes when the input ends. Adapters that need a file or a MediaStream convert it themselves.
 */
export interface StreamingTranscriber {
  transcribe: (request: { audio: ReadableStream<PcmBlock>, signal: AbortSignal, bias?: TranscriptionBias }) => ReadableStream<TranscriptionEvent>
}

/** Submission identity is stable across transport retries. The adapter owns persistence. */
export interface SpeechSubmission {
  readonly submissionId: string
  readonly sessionId: string
  readonly text: string
  readonly transcript: {
    readonly raw: TranscriptSnapshot
    readonly corrected: TranscriptSnapshot
    readonly history: readonly TranscriptSnapshot[]
    readonly patches: readonly TranscriptPatch[]
  }
  readonly context: SpeechSnapshot['context']
  readonly speakers?: SpeakerEvidence
}

/** External operations that one speech input uses. The controller supplies them from its options. */
export interface SpeechInputPorts {
  readonly transcriber?: (sessionId: string) => StreamingTranscriber
  readonly submit?: (submission: SpeechSubmission, signal: AbortSignal) => Promise<{ status: 'committed', messageId: string } | { status: 'drafted', draftId: string }>
  readonly conversationContext?: (sessionId: string) => { readonly revision: number, readonly messages: readonly { role: string, text: string }[] }
  /**
   * Reads the bias for the next provider request. It is a synchronous read of a prepared list.
   * The host builds the list between turns, so speech start waits for no lookup.
   */
  readonly transcriptionBias?: (sessionId: string) => TranscriptionBias | undefined
}
