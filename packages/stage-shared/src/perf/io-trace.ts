export const IOSubsystems = {
  ASR: 'asr',
  LLM: 'llm',
  TTS: 'tts',
  Playback: 'playback',
} as const
export type IOSubsystem = (typeof IOSubsystems)[keyof typeof IOSubsystems]

export const IOSpanNames = {
  InteractionTurn: 'Interaction turn',
  SpeechRecognition: 'Speech recognition',
  LLMInference: 'LLM inference',
  TTSSegment: 'TTS segment',
  TTSSynthesis: 'TTS synthesis',
  AudioPlayback: 'Audio playback',
} as const

export const IOAttrs = {
  Subsystem: 'io.subsystem',
  ASRProvider: 'asr.provider',
  ASRText: 'asr.text',
  ASRAbort: 'asr.abort',
  LLMModel: 'llm.model',
  LLM_TTFT: 'llm.ttft_ms',
  LLMTextLength: 'llm.text_length',
  TTSSegmentId: 'tts.segment_id',
  TTSText: 'tts.text',
  TTSChunkReason: 'tts.chunk_reason',
  TTSInterrupted: 'tts.interrupted',
  TTSInterruptReason: 'tts.interrupt_reason',
  TTSCanceled: 'tts.canceled',
} as const

export const IOEvents = {
  FirstToken: 'ai.moeru.airi.io.first_token', // Non-standard
  SentenceEnd: 'ai.moeru.airi.io.sentence_end', // Non-standard
} as const

export interface IOSpan {
  id: string
  traceId: string
  parentSpanId?: string
  startTs: number
  endTs?: number

  ttsCorrelationId?: string
  subsystem: IOSubsystem
  name: string
  meta: Record<string, any>
}

export interface IOTurn {
  id: string
  startTs: number
  endTs?: number
  inputText?: string
  outputText?: string
  spans: IOSpan[]
}
