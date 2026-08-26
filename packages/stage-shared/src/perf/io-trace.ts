export const IOSubsystems = {
  ASR: 'asr',
  LLM: 'llm',
  Playback: 'playback',
  StreamingControl: 'streaming-control',
  TTS: 'tts',
  VAD: 'vad',
} as const
export type IOSubsystem = (typeof IOSubsystems)[keyof typeof IOSubsystems]

export const IOSpanNames = {
  AudioPlayback: 'Audio playback',
  InteractionTurn: 'Interaction turn',
  LLMInference: 'LLM inference',
  SpeechRecognition: 'Speech recognition',
  SpeechTurn: 'Speech turn',
  StreamingControlDispatch: 'Streaming control dispatch',
  TTSSynthesis: 'TTS synthesis',
  VoiceActivityDetection: 'Voice activity detection',
} as const

const customPrefix = 'ai.moeru.airi.io'

export const IOAttributes = {
  ASRAbort: `${customPrefix}.asr.abort`,
  ASRText: `${customPrefix}.asr.text`,

  GenAIProviderName: 'gen_ai.provider.name',
  GenAIRequestModel: 'gen_ai.request.model',
  LLM_TTFT: `${customPrefix}.llm.time_to_first_token`,
  LLMInputMessageCount: `${customPrefix}.llm.input_message_count`,
  LLMInputMessageRoles: `${customPrefix}.llm.input_message_roles`,
  LLMInputUserMessageCount: `${customPrefix}.llm.input_user_message_count`,
  LLMOutputChunkCount: `${customPrefix}.llm.output_chunk_count`,
  LLMOutputChunkLengths: `${customPrefix}.llm.output_chunk_lengths`,
  LLMTextLength: `${customPrefix}.llm.text_length`,
  StreamingControlCallName: `${customPrefix}.streaming_control.call_name`,
  StreamingControlHandlerCount: `${customPrefix}.streaming_control.handler_count`,
  StreamingControlMatched: `${customPrefix}.streaming_control.matched`,
  StreamingControlParameter: `${customPrefix}.streaming_control.parameter`,
  StreamingControlParsed: `${customPrefix}.streaming_control.parsed`,
  StreamingControlParserName: `${customPrefix}.streaming_control.parser_name`,
  StreamingControlRawToken: `${customPrefix}.streaming_control.raw_token`,
  StreamingControlReason: `${customPrefix}.streaming_control.reason`,
  StreamingControlTokenLength: `${customPrefix}.streaming_control.token_length`,
  StreamingControlTokenType: `${customPrefix}.streaming_control.token_type`,
  StreamingControlTurnId: `${customPrefix}.streaming_control.turn_id`,
  // Non-standard
  Subsystem: `${customPrefix}.subsystem`,
  TooltipKeys: `${customPrefix}.tooltip.keys`,
  TTSAudioDurationMs: `${customPrefix}.tts.audio_duration_ms`,
  TTSCanceled: `${customPrefix}.tts.canceled`,
  TTSChunkReason: `${customPrefix}.tts.chunk_reason`,
  TTSInterrupted: `${customPrefix}.tts.interrupted`,
  TTSInterruptReason: `${customPrefix}.tts.interrupt_reason`,
  TTSSegmentId: `${customPrefix}.tts.segment_id`,
  TTSText: `${customPrefix}.tts.text`,
  TurnId: `${customPrefix}.turn_id`,
  VADAborted: `${customPrefix}.vad.aborted`,
  VADAudioDurationMs: `${customPrefix}.vad.audio_duration_ms`,
} as const

export const IOEvents = {
  ASRSentenceEnd: `${customPrefix}.asr.sentence_end`,
  // Non-standard
  LLMFirstToken: `${customPrefix}.llm.first_token`,
  StreamingControlHandlerEnd: `${customPrefix}.streaming_control.handler_end`,
  StreamingControlHandlerError: `${customPrefix}.streaming_control.handler_error`,
  StreamingControlHandlerStart: `${customPrefix}.streaming_control.handler_start`,
  StreamingControlParsed: `${customPrefix}.streaming_control.parsed`,
  StreamingControlRejected: `${customPrefix}.streaming_control.rejected`,
  StreamingControlSignalHandlerError: `${customPrefix}.streaming_control.signal_handler_error`,
} as const

export interface IOSpan {
  endTs?: number
  /** OTel events attached to the span. */
  events?: IOSpanEvent[]
  id: string
  meta: Record<string, any>
  name: string

  parentSpanId?: string
  startTs: number
  subsystem: IOSubsystem
  traceId: string
  ttsCorrelationId?: string
}

/**
 * Event captured inside an IO tracing span.
 */
export interface IOSpanEvent {
  /** Event attributes normalized for the devtools UI. */
  meta: Record<string, unknown>
  /** OTel event name. */
  name: string
  /** Event timestamp in milliseconds. */
  timeTs: number
}

export interface IOTurn {
  endTs?: number
  id: string
  inputText?: string
  outputText?: string
  spans: IOSpan[]
  startTs: number
}
