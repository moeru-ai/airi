/**
 * Control messages that an AIRI client sends during one ASR WebSocket session.
 * Binary WebSocket frames carry PCM audio and are not part of this union.
 */
export type AudioTranscriptionClientControlMessage
  = | {
    event: 'start'
    /** Official ASR capability alias. */
    model: 'auto'
    /** Audio format for all following binary frames. */
    format: 'pcm'
    /** Audio sample rate in hertz. */
    sample_rate: 16000
  }
  | { event: 'stop' }
  | { event: 'cancel' }

/** Messages that the AIRI server sends during one ASR WebSocket session. */
export type AudioTranscriptionServerMessage
  = | { event: 'session.started' }
    | { event: 'transcript.text.delta', delta: string }
    | { event: 'transcript.text.done' }
    | { event: 'session.finished' }
    | { event: 'error', code: string, message: string }
