export const IOSubsystems = {
  ASR: 'asr',
  LLM: 'llm',
  StreamingControl: 'streaming-control',
  TTS: 'tts',
  Playback: 'playback',
} as const
export type IOSubsystem = (typeof IOSubsystems)[keyof typeof IOSubsystems]

export const IOSpanNames = {
  InteractionTurn: 'Interaction turn',
  SpeechRecognition: 'Speech recognition',
  LLMInference: 'LLM inference',
  StreamingControlDispatch: 'Streaming control dispatch',
  TTSSynthesis: 'TTS synthesis',
  AudioPlayback: 'Audio playback',
} as const

const customPrefix = 'ai.moeru.airi.io'

export const IOAttributes = {
  GenAIRequestModel: 'gen_ai.request.model',
  GenAIProviderName: 'gen_ai.provider.name',

  // Non-standard
  Subsystem: `${customPrefix}.subsystem`,
  TooltipKeys: `${customPrefix}.tooltip.keys`,
  LLM_TTFT: `${customPrefix}.llm.time_to_first_token`,
  ASRText: `${customPrefix}.asr.text`,
  ASRAbort: `${customPrefix}.asr.abort`,
  LLMTextLength: `${customPrefix}.llm.text_length`,
  StreamingControlCallName: `${customPrefix}.streaming_control.call_name`,
  StreamingControlHandlerCount: `${customPrefix}.streaming_control.handler_count`,
  StreamingControlMatched: `${customPrefix}.streaming_control.matched`,
  StreamingControlParameter: `${customPrefix}.streaming_control.parameter`,
  StreamingControlParsed: `${customPrefix}.streaming_control.parsed`,
  StreamingControlParserName: `${customPrefix}.streaming_control.parser_name`,
  StreamingControlReason: `${customPrefix}.streaming_control.reason`,
  StreamingControlRawToken: `${customPrefix}.streaming_control.raw_token`,
  StreamingControlTokenLength: `${customPrefix}.streaming_control.token_length`,
  StreamingControlTokenType: `${customPrefix}.streaming_control.token_type`,
  StreamingControlTurnId: `${customPrefix}.streaming_control.turn_id`,
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
  StreamingControlHandlerEnd: `${customPrefix}.streaming_control.handler_end`,
  StreamingControlHandlerError: `${customPrefix}.streaming_control.handler_error`,
  StreamingControlHandlerStart: `${customPrefix}.streaming_control.handler_start`,
  StreamingControlParsed: `${customPrefix}.streaming_control.parsed`,
  StreamingControlRejected: `${customPrefix}.streaming_control.rejected`,
  StreamingControlSignalHandlerError: `${customPrefix}.streaming_control.signal_handler_error`,
} as const

/**
 * Event captured inside an IO tracing span.
 */
export interface IOSpanEvent {
  /** OTel event name. */
  name: string
  /** Event timestamp in milliseconds. */
  timeTs: number
  /** Event attributes normalized for the devtools UI. */
  meta: Record<string, unknown>
}

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
  /** OTel events attached to the span. */
  events?: IOSpanEvent[]
}

export interface IOTurn {
  id: string
  startTs: number
  endTs?: number
  inputText?: string
  outputText?: string
  spans: IOSpan[]
}
