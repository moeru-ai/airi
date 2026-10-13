import type { AgentTraceUpload } from '../../../routes/agent-traces/schema'
import type { agentTraceSpanKinds } from '../../../schemas/agent-trace'

type Kind = typeof agentTraceSpanKinds[number]

const io = 'ai.moeru.airi.io'

/** The span names of `IOSpanNames` in `packages/stage-shared/src/perf/io-trace.ts`. */
const kindByName: Record<string, Kind> = {
  'Interaction turn': 'turn',
  'LLM inference': 'llm_step',
  'Tool execution': 'tool',
  'Wake word': 'wake_word',
  'Voice input': 'voice_input',
  'Voice activity detection': 'vad',
  'Speech recognition': 'asr',
  'End of speech judgement': 'end_judge',
  'Transcript rephrase': 'rephrase',
  'Speech turn': 'speech_turn',
  'TTS synthesis': 'tts',
  'Audio playback': 'playback',
  'Streaming control dispatch': 'streaming_control',
}

/** Attributes that become columns. Any kind can carry them. */
const columnKeys = {
  interactionId: `${io}.turn_id`,
  sessionId: 'gen_ai.conversation.id',
  requestId: `${io}.request_id`,
  toolName: 'gen_ai.tool.name',
  toolCallId: 'gen_ai.tool.call.id',
  errorType: 'error.type',
} as const

const columnKeySet = new Set<string>(Object.values(columnKeys))
const cancelledKey = `${io}.cancelled`
const speechOutput = [`${io}.tts.segment_id`, `${io}.tts.chunk_reason`, `${io}.tts.audio_duration_ms`, `${io}.tts.interrupted`, `${io}.tts.interrupt_reason`, `${io}.tts.canceled`, `${io}.tts.no_audio`]

/**
 * The attributes that each kind keeps in `attributes`. Every other key is dropped.
 *
 * Content is never on this list: `asr.text`, `tts.text`, `kws.text`, `kws.tokens`,
 * `streaming_control.parameter`, and `streaming_control.raw_token` hold what the user or the model said.
 */
const allowedByKind: Record<Kind, readonly string[]> = {
  turn: [],
  llm_step: ['gen_ai.request.model', 'gen_ai.provider.name', `${io}.llm.step_index`, `${io}.llm.time_to_first_token`, `${io}.llm.input_message_count`, `${io}.llm.input_user_message_count`, `${io}.llm.output_chunk_count`, `${io}.llm.text_length`],
  tool: [],
  wake_word: [`${io}.kws.character_id`],
  voice_input: [`${io}.voice_input.id`, `${io}.voice_input.trigger`, `${io}.voice_input.outcome`, `${io}.voice_input.reason`],
  vad: [`${io}.vad.audio_duration_ms`, `${io}.vad.aborted`],
  asr: [`${io}.asr.abort`],
  end_judge: [`${io}.end_judge.judgement`, `${io}.end_judge.transcript_length`],
  rephrase: [`${io}.rephrase.segment_count`, `${io}.rephrase.changed_count`],
  speech_turn: speechOutput,
  tts: speechOutput,
  playback: speechOutput,
  streaming_control: [`${io}.streaming_control.parser_name`, `${io}.streaming_control.parsed`, `${io}.streaming_control.matched`, `${io}.streaming_control.handler_count`, `${io}.streaming_control.reason`, `${io}.streaming_control.call_name`, `${io}.streaming_control.token_type`, `${io}.streaming_control.token_length`],
}

/** Longer strings are dropped, so an allowlisted key cannot carry a transcript. */
const valueLimit = 256

type Scalar = string | number | boolean

function scalar(value: unknown): Scalar | undefined {
  if (typeof value === 'string')
    return value.length <= valueLimit ? value : undefined
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined
  return typeof value === 'boolean' ? value : undefined
}

function text(value: Scalar | undefined) {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export interface SpanRow {
  traceId: string
  spanId: string
  parentSpanId: string | null
  name: string
  kind: Kind
  interactionId: string | null
  sessionId: string | null
  requestId: string | null
  toolName: string | null
  toolCallId: string | null
  status: 'ok' | 'error' | 'cancelled'
  errorType: string | null
  startedAt: Date
  durationMs: number | null
  attributes: Record<string, Scalar> | null
  appSurface: string
  appVersion: string | null
}

/**
 * Turns an upload into rows. Drops spans with an unknown name and every attribute that is not allowlisted for its kind.
 *
 * Returns the counts of dropped spans and attributes, so a client that sends too much is visible.
 */
export function toSpanRows(upload: AgentTraceUpload) {
  let droppedSpans = 0
  let droppedAttributes = 0
  const rows: SpanRow[] = []
  for (const span of upload.spans) {
    const kind = kindByName[span.name]
    if (!kind) {
      droppedSpans += 1
      continue
    }
    const allowed = new Set(allowedByKind[kind])
    const kept: Record<string, Scalar> = {}
    const columns = new Map<string, Scalar>()
    for (const [key, raw] of Object.entries(span.attributes)) {
      if (key === cancelledKey)
        continue
      const value = scalar(raw)
      if (value !== undefined && columnKeySet.has(key))
        columns.set(key, value)
      else if (value !== undefined && allowed.has(key))
        kept[key] = value
      else
        droppedAttributes += 1
    }
    const end = span.endTimeUnixMs ?? undefined
    rows.push({
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId ?? null,
      name: span.name,
      kind,
      interactionId: text(columns.get(columnKeys.interactionId)) ?? null,
      sessionId: text(columns.get(columnKeys.sessionId)) ?? null,
      requestId: text(columns.get(columnKeys.requestId)) ?? null,
      toolName: text(columns.get(columnKeys.toolName)) ?? null,
      toolCallId: text(columns.get(columnKeys.toolCallId)) ?? null,
      // The IO tracer marks an aborted span with an attribute and no error status.
      status: span.attributes[cancelledKey] === true ? 'cancelled' : span.status,
      errorType: text(columns.get(columnKeys.errorType)) ?? null,
      startedAt: new Date(span.startTimeUnixMs),
      durationMs: end !== undefined && end >= span.startTimeUnixMs ? end - span.startTimeUnixMs : null,
      attributes: Object.keys(kept).length > 0 ? kept : null,
      appSurface: upload.resource.appSurface,
      appVersion: upload.resource.appVersion ?? null,
    })
  }
  return { rows, droppedSpans, droppedAttributes }
}
