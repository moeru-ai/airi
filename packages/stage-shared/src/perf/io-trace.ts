export const IOSubsystems = {
  VoiceInput: 'voice-input',
  KWS: 'kws',
  VAD: 'vad',
  ASR: 'asr',
  EndJudge: 'end-judge',
  Rephrase: 'rephrase',
  LLM: 'llm',
  LLMRequest: 'llm-request',
  Tool: 'tool',
  StreamingControl: 'streaming-control',
  TTS: 'tts',
  Playback: 'playback',
} as const
export type IOSubsystem = (typeof IOSubsystems)[keyof typeof IOSubsystems]

/**
 * Span names of the voice and chat pipeline.
 *
 * A spoken turn is one trace: `Wake word` (when a wake started the input) or `Voice input` is the root.
 * `Voice input` holds VAD segments, speech recognition, end judgements, and the rephrase.
 * The `Interaction turn` that the input submits is its child, and it holds the LLM, TTS, and playback spans.
 * A typed turn starts its own trace at `Interaction turn`.
 */
export const IOSpanNames = {
  WakeWord: 'Wake word',
  VoiceInput: 'Voice input',
  EndOfSpeechJudgement: 'End of speech judgement',
  TranscriptRephrase: 'Transcript rephrase',
  InteractionTurn: 'Interaction turn',
  SpeechTurn: 'Speech turn',
  VoiceActivityDetection: 'Voice activity detection',
  SpeechRecognition: 'Speech recognition',
  LLMInference: 'LLM inference',
  /** One HTTP request to the official chat API. A child of `LLM inference`. A turn with tool calls has one for each step. */
  LLMRequest: 'LLM request',
  ToolExecution: 'Tool execution',
  StreamingControlDispatch: 'Streaming control dispatch',
  TTSSynthesis: 'TTS synthesis',
  AudioPlayback: 'Audio playback',
} as const

const customPrefix = 'ai.moeru.airi.io'

export const IOAttributes = {
  GenAIRequestModel: 'gen_ai.request.model',
  GenAIProviderName: 'gen_ai.provider.name',
  GenAIConversationId: 'gen_ai.conversation.id',
  GenAIToolName: 'gen_ai.tool.name',
  GenAIToolCallId: 'gen_ai.tool.call.id',
  ErrorType: 'error.type',

  // Non-standard
  Subsystem: `${customPrefix}.subsystem`,
  TooltipKeys: `${customPrefix}.tooltip.keys`,
  LLM_TTFT: `${customPrefix}.llm.time_to_first_token`,
  VoiceInputId: `${customPrefix}.voice_input.id`,
  /** `control` (a voice button or Push to Talk), `speech` (VAD), or `wake-word`. */
  VoiceInputTrigger: `${customPrefix}.voice_input.trigger`,
  /** `committed`, `drafted`, `cancelled`, or `failed`. */
  VoiceInputOutcome: `${customPrefix}.voice_input.outcome`,
  VoiceInputReason: `${customPrefix}.voice_input.reason`,
  WakeCharacterId: `${customPrefix}.kws.character_id`,
  WakeText: `${customPrefix}.kws.text`,
  WakeTokens: `${customPrefix}.kws.tokens`,
  EndJudgement: `${customPrefix}.end_judge.judgement`,
  EndJudgeTranscriptLength: `${customPrefix}.end_judge.transcript_length`,
  RephraseSegmentCount: `${customPrefix}.rephrase.segment_count`,
  RephraseChangedCount: `${customPrefix}.rephrase.changed_count`,
  VADAudioDurationMs: `${customPrefix}.vad.audio_duration_ms`,
  VADAborted: `${customPrefix}.vad.aborted`,
  ASRText: `${customPrefix}.asr.text`,
  ASRAbort: `${customPrefix}.asr.abort`,
  LLMInputMessageCount: `${customPrefix}.llm.input_message_count`,
  LLMInputMessageRoles: `${customPrefix}.llm.input_message_roles`,
  LLMInputUserMessageCount: `${customPrefix}.llm.input_user_message_count`,
  LLMOutputChunkCount: `${customPrefix}.llm.output_chunk_count`,
  LLMOutputChunkLengths: `${customPrefix}.llm.output_chunk_lengths`,
  LLMTextLength: `${customPrefix}.llm.text_length`,
  /** The position of an `LLM request` in its `LLM inference`, from 0. */
  LLMStepIndex: `${customPrefix}.llm.step_index`,
  /** The `x-airi-request-id` of the gateway response, which equals `llm_request_log.request_id`. */
  RequestId: `${customPrefix}.request_id`,
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
  TTSAudioDurationMs: `${customPrefix}.tts.audio_duration_ms`,
  TTSInterrupted: `${customPrefix}.tts.interrupted`,
  TTSInterruptReason: `${customPrefix}.tts.interrupt_reason`,
  TTSCanceled: `${customPrefix}.tts.canceled`,
  /** The speech output returned no audio without an abort. For example, speech is muted or has no provider. */
  TTSNoAudio: `${customPrefix}.tts.no_audio`,
  TurnId: `${customPrefix}.turn_id`,
  /** The caller aborted the work. The span has no error status then. */
  Cancelled: `${customPrefix}.cancelled`,
} as const

/**
 * The attributes that the agent trace upload sends. The upload drops every other attribute before it leaves the client.
 *
 * Content is never on this list: ASR, TTS, and wake word text, streaming control parameters and raw tokens,
 * tool arguments, and tool results. The API applies its own allowlist too.
 */
export const IOUploadAttributes: ReadonlySet<string> = new Set([
  IOAttributes.GenAIRequestModel,
  IOAttributes.GenAIProviderName,
  IOAttributes.GenAIConversationId,
  IOAttributes.GenAIToolName,
  IOAttributes.GenAIToolCallId,
  IOAttributes.ErrorType,
  IOAttributes.TurnId,
  IOAttributes.RequestId,
  IOAttributes.Cancelled,
  IOAttributes.LLM_TTFT,
  IOAttributes.LLMStepIndex,
  IOAttributes.LLMInputMessageCount,
  IOAttributes.LLMInputUserMessageCount,
  IOAttributes.LLMOutputChunkCount,
  IOAttributes.LLMTextLength,
  IOAttributes.WakeCharacterId,
  IOAttributes.VoiceInputId,
  IOAttributes.VoiceInputTrigger,
  IOAttributes.VoiceInputOutcome,
  IOAttributes.VoiceInputReason,
  IOAttributes.VADAudioDurationMs,
  IOAttributes.VADAborted,
  IOAttributes.ASRAbort,
  IOAttributes.EndJudgement,
  IOAttributes.EndJudgeTranscriptLength,
  IOAttributes.RephraseSegmentCount,
  IOAttributes.RephraseChangedCount,
  IOAttributes.TTSSegmentId,
  IOAttributes.TTSChunkReason,
  IOAttributes.TTSAudioDurationMs,
  IOAttributes.TTSInterrupted,
  IOAttributes.TTSInterruptReason,
  IOAttributes.TTSCanceled,
  IOAttributes.TTSNoAudio,
  IOAttributes.StreamingControlParserName,
  IOAttributes.StreamingControlParsed,
  IOAttributes.StreamingControlMatched,
  IOAttributes.StreamingControlHandlerCount,
  IOAttributes.StreamingControlReason,
  IOAttributes.StreamingControlCallName,
  IOAttributes.StreamingControlTokenType,
  IOAttributes.StreamingControlTokenLength,
])

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
