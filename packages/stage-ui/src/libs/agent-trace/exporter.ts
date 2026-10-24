import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'

import { SpanStatusCode } from '@opentelemetry/api'
import { hrTimeToMilliseconds } from '@opentelemetry/core'
import { IOSpanNames, IOUploadAttributes } from '@proj-airi/stage-shared'

/** One span of `POST /api/v1/agent-traces`. */
export interface AgentTraceUploadSpan {
  traceId: string
  spanId: string
  parentSpanId: string | null
  name: string
  startTimeUnixMs: number
  endTimeUnixMs: number
  status: 'ok' | 'error'
  attributes: Record<string, string | number | boolean>
}

export interface AgentTraceResource {
  /** The names of the `x-airi-app-surface` chat header, which the request log stores. */
  appSurface: 'web' | 'electron' | 'mobile'
  appVersion?: string
}

export interface AgentTraceExporterOptions {
  /** Reads the analytics setting. Spans that end while it is off are dropped. */
  enabled: () => boolean
  resource: () => AgentTraceResource
  /** The upload is skipped without a token. */
  token: () => string | null | undefined
  endpoint: string
  fetch?: typeof globalThis.fetch
  now?: () => number
}

/** The API accepts at most this many spans in one upload. */
const MAX_BATCH_SPANS = 500
/** A trace whose turn has not ended in this time is dropped, for example a voice input that was never sent. */
const TRACE_TTL_MS = 10 * 60_000
const MAX_TRACES = 64
const MAX_PENDING_SPANS = 200
const MAX_QUEUED_SPANS = 2_000
/** Browsers refuse a `keepalive` request with a larger body. */
const KEEPALIVE_BODY_LIMIT = 60_000

interface TraceState {
  spans: AgentTraceUploadSpan[]
  official: boolean
  external: boolean
  verdict?: 'upload' | 'drop'
  touchedAt: number
}

export function toUploadSpan(span: ReadableSpan): AgentTraceUploadSpan {
  const attributes: AgentTraceUploadSpan['attributes'] = {}
  for (const [key, value] of Object.entries(span.attributes)) {
    if (IOUploadAttributes.has(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'))
      attributes[key] = value
  }
  return {
    traceId: span.spanContext().traceId,
    spanId: span.spanContext().spanId,
    parentSpanId: span.parentSpanContext?.spanId ?? null,
    name: span.name,
    startTimeUnixMs: Math.round(hrTimeToMilliseconds(span.startTime)),
    endTimeUnixMs: Math.round(hrTimeToMilliseconds(span.endTime)),
    status: span.status.code === SpanStatusCode.ERROR ? 'error' : 'ok',
    attributes,
  }
}

/**
 * Collects ended IO tracer spans and uploads the traces of turns that used only the official provider.
 *
 * The chat store marks each step of a turn as official or external. The exporter holds the spans of a trace until
 * its `Interaction turn` span ends, and then uploads them only if every step was official. A trace with an external
 * step, or with no step, is dropped, so no data of a provider that AIRI does not run leaves the client.
 * Spans that end after the turn, such as audio playback, follow the decision of their trace.
 *
 * A failed upload drops its batch. It does not retry, and it never blocks a turn.
 */
export function createAgentTraceExporter(options: AgentTraceExporterOptions) {
  const now = options.now ?? Date.now
  const traces = new Map<string, TraceState>()
  const queue: AgentTraceUploadSpan[] = []

  /** Returns the state of a trace. The map stays in the order of last use, so pruning removes the least recent first. */
  function stateOf(traceId: string) {
    const state = traces.get(traceId) ?? { spans: [], official: false, external: false, touchedAt: 0 }
    state.touchedAt = now()
    traces.delete(traceId)
    traces.set(traceId, state)
    return state
  }

  function prune() {
    const expired = now() - TRACE_TTL_MS
    for (const [traceId, state] of traces) {
      if (state.touchedAt >= expired && traces.size <= MAX_TRACES)
        break
      traces.delete(traceId)
    }
  }

  function enqueue(spans: AgentTraceUploadSpan[]) {
    queue.push(...spans)
    if (queue.length > MAX_QUEUED_SPANS)
      queue.splice(0, queue.length - MAX_QUEUED_SPANS)
  }

  /** Records that a step of the turn in `traceId` sent its request to the official provider, or to another one. */
  function markStep(traceId: string, official: boolean) {
    const state = stateOf(traceId)
    if (official)
      state.official = true
    else
      state.external = true
  }

  function handleSpan(span: ReadableSpan) {
    if (!options.enabled())
      return
    const upload = toUploadSpan(span)
    const state = stateOf(upload.traceId)
    if (state.verdict === 'upload') {
      enqueue([upload])
    }
    else if (!state.verdict) {
      if (state.spans.length < MAX_PENDING_SPANS)
        state.spans.push(upload)
      if (span.name === IOSpanNames.InteractionTurn) {
        state.verdict = state.official && !state.external ? 'upload' : 'drop'
        if (state.verdict === 'upload')
          enqueue(state.spans)
        state.spans = []
      }
    }
    prune()
  }

  /** Uploads the queued spans. `keepalive` lets the request outlive a page that is being hidden or closed. */
  async function flush(flushOptions: { keepalive?: boolean } = {}) {
    if (queue.length === 0)
      return
    const token = options.token()
    if (!options.enabled() || !token) {
      queue.length = 0
      return
    }
    const fetch = options.fetch ?? globalThis.fetch
    while (queue.length > 0) {
      const spans = queue.splice(0, MAX_BATCH_SPANS)
      const body = JSON.stringify({ resource: options.resource(), spans })
      try {
        await fetch(options.endpoint, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body,
          credentials: 'omit',
          keepalive: flushOptions.keepalive === true && body.length <= KEEPALIVE_BODY_LIMIT,
        })
      }
      catch (error) {
        console.warn('[agent-trace] Failed to upload spans:', error)
      }
    }
  }

  return { handleSpan, markStep, flush }
}
