import process from 'node:process'

import { startObservation } from '@langfuse/tracing'

/**
 * Upper bound on the assistant text buffered for a streaming generation's
 * `output`. Without a cap a pathological long completion under concurrency would
 * pin `N × completion_size` in memory; Langfuse truncates large payloads
 * server-side anyway, so a generous cap loses nothing useful.
 */
const STREAM_OUTPUT_CHAR_CAP = 1_000_000

/** Parameters identifying the chat request a generation traces. */
export interface ChatGenerationInput extends Omit<GenerationInput, 'metadata' | 'name'> {
  /** OpenAI chat `messages` array (the prompt), recorded verbatim as trace input. */
  input: unknown
  /** Whether the response is streamed (affects how output is captured). */
  stream: boolean
}

/** Terminal usage/cost figures recorded when a chat generation completes successfully. */
export interface ChatGenerationResult {
  completionTokens?: number
  /** AIRI business cost (flux). Stored in generation metadata, not `costDetails`. */
  fluxConsumed?: number
  /**
   * Explicit completion to record. Omit for streaming requests to use the
   * assistant text assembled from the streamed SSE deltas.
   */
  output?: unknown
  promptTokens?: number
}

/**
 * Lifecycle handle for one chat completion's Langfuse generation.
 *
 * Hides whether Langfuse is enabled (no-op when off), the SDK call shape, the
 * trace field mapping, and the streamed-output assembly. The owning route only
 * drives the domain lifecycle: feed stream chunks, then end with success or
 * failure exactly once (subsequent calls are ignored, so every transport exit
 * branch can call defensively without double-ending).
 */
export interface ChatGenerationTrace {
  /**
   * Feed one decoded chunk of streamed SSE text. Accumulates the assistant
   * completion for the trace `output`, bounded by the char cap. No-op for
   * non-streaming requests (which pass `output` to {@link ChatGenerationTrace.succeed}).
   */
  appendStreamChunk: (decodedChunk: string) => void
  /** Record a failure (`level: ERROR` + message) and end the generation. */
  fail: (statusMessage: string) => void
  /** Record a successful completion with usage/cost and end the generation. */
  succeed: (result: ChatGenerationResult) => void
}

/** Parameters identifying the TTS request a generation traces. */
export interface TtsGenerationInput extends Omit<GenerationInput, 'metadata' | 'name'> {
  /** Adapter-neutral TTS request payload, recorded as trace input. */
  input: {
    responseFormat?: string
    speed?: number
    text: string
    voice?: string
  }
}

/** Terminal usage/cost figures recorded when a TTS generation completes successfully. */
export interface TtsGenerationResult {
  /** AIRI business cost (flux). Stored in generation metadata, not `costDetails`. */
  fluxConsumed?: number
  /** Input character count charged by the TTS flux meter. */
  inputChars: number
  /** Additional terminal metadata to merge with request metadata. */
  metadata?: Record<string, unknown>
  /** Output metadata only; binary audio is not buffered into Langfuse. */
  output?: unknown
}

/** Lifecycle handle for one TTS Langfuse generation. */
export interface TtsGenerationTrace {
  /** Record a failure (`level: ERROR` + message) and end the generation. */
  fail: (statusMessage: string) => void
  /** Record a successful speech generation with character usage/cost and end the generation. */
  succeed: (result: TtsGenerationResult) => void
}

/** Parameters identifying a request a Langfuse generation traces. */
interface GenerationInput {
  /** Provider-domain input payload, recorded verbatim as trace input. */
  input: unknown
  /** Extra observation metadata. */
  metadata?: Record<string, unknown>
  /** Resolved upstream model id (after `auto` aliases are replaced). */
  model: string
  /** Generation name shown in Langfuse. */
  name: string
  /** Correlation id shared with billing / request-log rows. */
  requestId: string
  /** Client-supplied conversation id (`x-airi-session-id`). Absent → user-only attribution. */
  sessionId?: string
  /** Billing/identity owner of the request. Lifted to trace-level `userId`. */
  userId: string
}

/** Terminal usage/cost figures recorded when a generation completes successfully. */
interface GenerationResult {
  /** AIRI business cost (flux). Stored in generation metadata, not `costDetails`. */
  fluxConsumed?: number
  /** Additional terminal metadata to merge with request metadata. */
  metadata?: Record<string, unknown>
  /**
   * Explicit completion to record. Omit for streaming requests to use the
   * assistant text assembled from the streamed SSE deltas.
   */
  output?: unknown
  /** Usage dimensions for Langfuse. For chat this is token counts; for TTS this is character count. */
  usageDetails?: Record<string, number>
}

/**
 * Extracts the assistant text delta from a single OpenAI streaming SSE line.
 *
 * Before:
 * - `data: {"choices":[{"delta":{"content":"Hel"}}]}`
 *
 * After:
 * - `"Hel"`
 *
 * Returns `''` for lines that carry no assistant text — `[DONE]`, role-only
 * deltas, usage-only chunks, blank/comment lines, or malformed JSON. The upstream
 * SSE is an external boundary, so per-line JSON parsing is tolerated and a parse
 * failure degrades to "this line added no text" rather than aborting capture:
 * output is best-effort trace data, not billing.
 */
function extractSseDeltaText(sseLine: string): string {
  const trimmed = sseLine.trimStart()
  if (!trimmed.startsWith('data:'))
    return ''
  const payload = trimmed.slice(5).trim()
  if (!payload || payload === '[DONE]')
    return ''
  try {
    const json = JSON.parse(payload)
    const content = json?.choices?.[0]?.delta?.content
    return typeof content === 'string' ? content : ''
  }
  catch {
    return ''
  }
}

/**
 * Whether per-request Langfuse generations should be created.
 *
 * Gated on the `LANGFUSE_TRACING_ACTIVE` sentinel that `instrumentation.ts` sets
 * ONLY after `setLangfuseTracerProvider()` succeeds — not on a raw key check.
 * Why: if the isolated Langfuse provider is not actually wired, `startObservation`
 * falls back to the GLOBAL OTel TracerProvider, which would ship prompt/completion
 * text to the OTLP/Grafana exporter. Binding to the real provider state (single
 * source of truth in instrumentation.ts) keeps a future change to the enable
 * condition there from silently desyncing this gate and leaking PII to the wrong
 * backend. Read per call (cheap; the value is process-constant after the preload
 * sets it) so the boundary stays self-contained and trivially testable.
 */
function tracingActive(): boolean {
  return process.env.LANGFUSE_TRACING_ACTIVE === '1'
}

const NOOP_CHAT_TRACE: ChatGenerationTrace = {
  appendStreamChunk() {},
  fail() {},
  succeed() {},
}

const NOOP_TTS_TRACE: TtsGenerationTrace = {
  fail() {},
  succeed() {},
}

/**
 * Starts a Langfuse generation for a chat completion, or a no-op handle when
 * Langfuse tracing is disabled.
 *
 * Use when:
 * - Entering a chat completion handler that should be traced for prompt/eval/cost.
 *
 * Expects:
 * - Called once per request. `instrumentation.ts` has already wired the isolated
 *   Langfuse TracerProvider when tracing is active.
 *
 * Returns:
 * - A {@link ChatGenerationTrace} whose `succeed`/`fail` are idempotent; the
 *   first call ends the generation and later calls are ignored.
 */
export function startChatGeneration(input: ChatGenerationInput): ChatGenerationTrace {
  const generation = startGeneration({
    input: input.input,
    metadata: { stream: input.stream },
    model: input.model,
    name: 'chat.completion',
    requestId: input.requestId,
    sessionId: input.sessionId,
    userId: input.userId,
  })
  if (!generation)
    return NOOP_CHAT_TRACE

  let assistantText = ''
  let sseLineBuffer = ''

  return {
    appendStreamChunk(decodedChunk) {
      if (assistantText.length >= STREAM_OUTPUT_CHAR_CAP)
        return
      // Split on newlines, parse complete lines, keep the partial trailing line
      // for the next chunk so a delta split across a chunk boundary still parses.
      sseLineBuffer += decodedChunk
      const lines = sseLineBuffer.split('\n')
      sseLineBuffer = lines.pop() ?? ''
      for (const line of lines) {
        const deltaText = extractSseDeltaText(line)
        const remainingChars = STREAM_OUTPUT_CHAR_CAP - assistantText.length
        if (remainingChars <= 0)
          break
        assistantText += deltaText.slice(0, remainingChars)
        if (assistantText.length >= STREAM_OUTPUT_CHAR_CAP)
          break
      }
    },
    fail(statusMessage) {
      generation.fail(statusMessage)
    },
    succeed(result) {
      generation.succeed({
        fluxConsumed: result.fluxConsumed,
        output: result.output ?? assistantText,
        usageDetails: { input: result.promptTokens ?? 0, output: result.completionTokens ?? 0 },
      })
    },
  }
}

/**
 * Starts a Langfuse generation for a TTS request, or a no-op handle when
 * Langfuse tracing is disabled.
 *
 * Use when:
 * - Entering the OpenAI-compatible `/audio/speech` handler.
 *
 * Expects:
 * - Binary audio is not buffered into Langfuse; callers pass output metadata
 *   such as content type instead.
 *
 * Returns:
 * - A {@link TtsGenerationTrace} whose `succeed`/`fail` are idempotent.
 */
export function startTtsGeneration(input: TtsGenerationInput): TtsGenerationTrace {
  const generation = startGeneration({
    input: input.input,
    metadata: {
      inputChars: input.input.text.length,
      responseFormat: input.input.responseFormat,
      speed: input.input.speed,
      voice: input.input.voice,
    },
    model: input.model,
    name: 'tts.speech',
    requestId: input.requestId,
    sessionId: input.sessionId,
    userId: input.userId,
  })
  if (!generation)
    return NOOP_TTS_TRACE

  return {
    fail(statusMessage) {
      generation.fail(statusMessage)
    },
    succeed(result) {
      generation.succeed({
        fluxConsumed: result.fluxConsumed,
        metadata: { inputChars: result.inputChars, ...result.metadata },
        output: result.output,
        usageDetails: { input: result.inputChars },
      })
    },
  }
}

function startGeneration(input: GenerationInput): null | {
  fail: (statusMessage: string) => void
  succeed: (result: GenerationResult) => void
} {
  if (!tracingActive())
    return null

  const baseMetadata = { requestId: input.requestId, ...input.metadata }
  const generation = startObservation(input.name, {
    input: input.input,
    metadata: baseMetadata,
    model: input.model,
  }, { asType: 'generation' })
  // Trace-level identity via Langfuse compat attributes, lifted to the trace by
  // the platform — enables per-user / per-session cost attribution.
  generation.otelSpan.setAttribute('langfuse.user.id', input.userId)
  if (input.sessionId)
    generation.otelSpan.setAttribute('langfuse.session.id', input.sessionId)

  let ended = false

  return {
    fail(statusMessage) {
      if (ended)
        return
      ended = true
      generation.update({ level: 'ERROR', metadata: baseMetadata, statusMessage })
      generation.end()
    },
    succeed(result) {
      if (ended)
        return
      ended = true
      generation.update({
        metadata: { ...baseMetadata, ...result.metadata, fluxConsumed: result.fluxConsumed ?? 0 },
        output: result.output,
        usageDetails: result.usageDetails,
      })
      generation.end()
    },
  }
}
