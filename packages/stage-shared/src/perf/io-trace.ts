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
  TTSSynthesis: 'TTS synthesis',
  AudioPlayback: 'Audio playback',
} as const

const customPrefix = 'ai.moeru.airi.io'

export const IOAttributes = {
  GenAIRequestModel: 'gen_ai.request.model',
  GenAIProviderName: 'gen_ai.provider.name',

  // Non-standard
  Subsystem: `${customPrefix}.subsystem`,
  LLM_TTFT: `${customPrefix}.llm.time_to_first_token`,
  ASRText: `${customPrefix}.asr.text`,
  ASRAbort: `${customPrefix}.asr.abort`,
  LLMTextLength: `${customPrefix}.llm.text_length`,
  TTSSegmentId: `${customPrefix}.tts.segment_id`,
  TTSText: `${customPrefix}.tts.text`,
  TTSChunkReason: `${customPrefix}.tts.chunk_reason`,
  TTSInterrupted: `${customPrefix}.tts.interrupted`,
  TTSInterruptReason: `${customPrefix}.tts.interrupt_reason`,
  TTSCanceled: `${customPrefix}.tts.canceled`,
} as const

export const IOEvents = {
  // Non-standard
  LLMFirstToken: `${customPrefix}.llm.first_token`,
  ASRSentenceEnd: `${customPrefix}.asr.sentence_end`,
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
