import type { PcmBlock } from '@proj-airi/pipelines-audio'

import type { TranscriptionEvent } from './transcript'
import type { SpeechSubmission } from './types'

/**
 * A provider request consumes PCM and produces transcription concurrently.
 *
 * The PCM stream closes when the input ends. Adapters that need a file or a MediaStream convert it themselves.
 */
export interface StreamingTranscriber {
  transcribe: (request: { audio: ReadableStream<PcmBlock>, signal: AbortSignal }) => ReadableStream<TranscriptionEvent>
}

/** Recent messages of a session. `revision` grows when the messages change, so a judgement can detect stale context. */
export interface ConversationContext {
  readonly revision: number
  readonly messages: readonly { role: string, text: string }[]
}

/** External operations that one speech input uses. The controller supplies them from its options. */
export interface SpeechInputPorts {
  readonly transcriber?: (sessionId: string) => StreamingTranscriber
  readonly submit?: (submission: SpeechSubmission, signal: AbortSignal) => Promise<{ status: 'committed', messageId: string } | { status: 'drafted', draftId: string }>
  readonly conversationContext?: (sessionId: string) => ConversationContext
}
