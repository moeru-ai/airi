/** Control frames sent by a client during one ASR WebSocket session. */
export type AudioTranscriptionClientControlMessage
  = | { event: 'start', model: 'auto', format: 'pcm', sample_rate: 16000 }
    | { event: 'stop' }
    | { event: 'cancel' }

/** Frames sent by the server during one ASR WebSocket session. */
export type AudioTranscriptionServerMessage
  = | { event: 'session.started' }
    | { event: 'transcript.text.delta', delta: string }
    | { event: 'transcript.text.snapshot', text: string, isFinal: boolean, durationMilliseconds: number }
    | { event: 'transcript.text.done' }
    | { event: 'session.finished' }
    | { event: 'error', code: string, message: string }
