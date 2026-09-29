import type { Attributes, Span, SpanContext, SpanStatusCode } from '@opentelemetry/api'
import type { ReadableSpan, SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace-base'
import type { SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'

import { context, trace } from '@opentelemetry/api'
import { hrTimeToNanoseconds } from '@opentelemetry/core'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BasicTracerProvider, BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { shallowRef } from 'vue'

export type { ReadableSpan } from '@opentelemetry/sdk-trace-base'

const TRACER_NAME = 'ai.moeru.airi.io-tracer'
const BROADCAST_CHANNEL = 'io-tracer-channel' // TODO: Use simple BroadcastChannel for now
const SENSITIVE_ATTRIBUTE_PATTERN = /(?:^|[._-])(?:authorization|cookie|password|passwd|secret|api[._-]?key|access[._-]?token|refresh[._-]?token|bearer)(?:[._-]|$)/i
const CONTENT_ATTRIBUTE_PATTERN = /content|prompt|completion|response|request|message|input|output|text|transcript|raw[._-]?token|parameter/i
const SENSITIVE_QUERY_PATTERN = /credential|signature|secret|token|api.?key|authorization/i

type SpanCallback = (span: ReadableSpan) => void

export function deserializeSpan(s: SerializedIOSpan): ReadableSpan {
  const nanoToHr = (nano: string): [number, number] => {
    const n = Number(nano)
    return [Math.floor(n / 1e9), n % 1e9]
  }
  const spanCtx: SpanContext = {
    isRemote: false,
    spanId: s.spanId,
    traceFlags: 1,
    traceId: s.traceId,
  }
  const parentCtx: SpanContext | undefined = s.parentSpanId
    ? { isRemote: false, spanId: s.parentSpanId, traceFlags: 1, traceId: s.traceId }
    : undefined

  return {
    attributes: s.attributes as Record<string, boolean | number | string>,
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
    duration: nanoToHr(String(Number(s.endTimeNano) - Number(s.startTimeNano))),
    ended: s.ended,
    endTime: nanoToHr(s.endTimeNano),
    events: s.events.map(e => ({
      attributes: e.attributes as Record<string, boolean | number | string>,
      droppedAttributesCount: 0,
      name: e.name,
      time: nanoToHr(e.timeNano),
    })),
    instrumentationScope: { name: TRACER_NAME },
    kind: s.kind,
    links: [],
    name: s.name,
    parentSpanContext: parentCtx,
    resource: { attributes: {}, merge: () => ({ attributes: {} }) } as any,
    spanContext: () => spanCtx,
    startTime: nanoToHr(s.startTimeNano),
    status: { code: s.status.code as SpanStatusCode, message: s.status.message },
  }
}

function serializeSpan(span: ReadableSpan): SerializedIOSpan {
  const ctx = span.spanContext()
  const parentCtx = span.parentSpanContext
  return {
    attributes: { ...span.attributes },
    ended: span.ended,
    endTimeNano: span.ended ? String(hrTimeToNanoseconds(span.endTime)) : '0',
    events: span.events.map(e => ({
      attributes: { ...e.attributes },
      name: e.name,
      timeNano: String(hrTimeToNanoseconds(e.time)),
    })),
    kind: span.kind,
    name: span.name,
    parentSpanId: parentCtx?.spanId ?? '',
    spanId: ctx.spanId,
    startTimeNano: String(hrTimeToNanoseconds(span.startTime)),
    status: { code: span.status.code, message: span.status.message ?? '' },
    traceId: ctx.traceId,
  }
}

let provider: BasicTracerProvider | undefined
let spanCallback: SpanCallback | undefined
let broadcastChannel: BroadcastChannel | undefined

export function createCallbackSpanExporter(): SpanExporter {
  return {
    export: (spans, resultCallback) => {
      for (const span of spans) {
        spanCallback?.(span)

        broadcastChannel?.postMessage({
          span: serializeSpan(span),
          type: 'span',
        })
      }
      resultCallback({ code: 0 /* SUCCESS */ })
    },
    forceFlush: () => Promise.resolve(),
    shutdown: () => Promise.resolve(),
  }
}

function filteredAttributes(attributes: Attributes, captureContent: boolean): Attributes {
  const filtered: Attributes = {}
  for (const [key, value] of Object.entries(attributes)) {
    if (SENSITIVE_ATTRIBUTE_PATTERN.test(key) || (!captureContent && CONTENT_ATTRIBUTE_PATTERN.test(key)))
      continue
    if (typeof value === 'string') {
      try {
        const url = new URL(value)
        for (const parameter of [...url.searchParams.keys()]) {
          if (SENSITIVE_QUERY_PATTERN.test(parameter))
            url.searchParams.set(parameter, '[redacted]')
        }
        filtered[key] = url.toString()
        continue
      }
      catch {}
    }
    filtered[key] = value
  }
  return filtered
}

function filteredSpan(span: ReadableSpan, captureContent: boolean): ReadableSpan {
  const attributes = filteredAttributes(span.attributes, captureContent)
  const events = span.events.map(event => ({
    ...event,
    attributes: event.attributes ? filteredAttributes(event.attributes, captureContent) : undefined,
  }))
  const status = captureContent ? span.status : { code: span.status.code }
  return new Proxy(span, {
    get: (target, property) => {
      if (property === 'attributes')
        return attributes
      if (property === 'events')
        return events
      if (property === 'status')
        return status
      const value = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

function createDebugSpanProcessor(): SpanProcessor | undefined {
  if (!import.meta.env.DEV)
    return undefined
  const endpoint = import.meta.env.VITE_AIRI_DEBUG_OTLP_ENDPOINT?.trim()
  const token = import.meta.env.VITE_AIRI_DEBUG_TOKEN?.trim()
  if (!endpoint || !token)
    return undefined

  let endpointUrl: URL
  try {
    endpointUrl = new URL(endpoint)
  }
  catch (error) {
    console.warn('[io-tracer] Ignoring invalid local debug OTLP endpoint', error)
    return undefined
  }
  if (!['http:', 'https:'].includes(endpointUrl.protocol)
    || endpointUrl.username
    || endpointUrl.password
    || endpointUrl.search
    || endpointUrl.hash
    || !['127.0.0.1', '[::1]', 'localhost'].includes(endpointUrl.hostname)) {
    return undefined
  }

  const captureContent = import.meta.env.VITE_AIRI_DEBUG_CAPTURE_CONTENT === 'true'
  if (!endpointUrl.pathname.endsWith('/v1/traces'))
    endpointUrl.pathname = `${endpointUrl.pathname.replace(/\/$/, '')}/v1/traces`
  const exporter = new OTLPTraceExporter({
    headers: { Authorization: `Bearer ${token}` },
    url: endpointUrl.toString(),
  })
  const filteringExporter: SpanExporter = {
    export: (spans, resultCallback) => exporter.export(spans.map(span => filteredSpan(span, captureContent)), resultCallback),
    forceFlush: () => exporter.forceFlush(),
    shutdown: () => exporter.shutdown(),
  }
  return new BatchSpanProcessor(filteringExporter, {
    exportTimeoutMillis: 5000,
    maxExportBatchSize: 100,
    maxQueueSize: 2048,
    scheduledDelayMillis: 250,
  })
}

export function getIOTracer() {
  if (provider)
    return provider.getTracer(TRACER_NAME)
  return trace.getTracer(TRACER_NAME)
}

export function initIOTracer() {
  if (!broadcastChannel)
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL)

  if (provider)
    return

  const spanProcessors: SpanProcessor[] = [new SimpleSpanProcessor(createCallbackSpanExporter())]
  const debugSpanProcessor = createDebugSpanProcessor()
  if (debugSpanProcessor)
    spanProcessors.push(debugSpanProcessor)

  provider = new BasicTracerProvider({
    resource: debugSpanProcessor
      ? resourceFromAttributes({
          'service.instance.id': Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''),
          'service.name': 'airi-stage-ui',
        })
      : undefined,
    spanProcessors,
  })
  trace.setGlobalTracerProvider(provider)
}

export function onIOSpan(cb: SpanCallback | undefined) {
  spanCallback = cb
}

export function onRemoteIOSpan(cb: SpanCallback): () => void {
  const channel = new BroadcastChannel(BROADCAST_CHANNEL)
  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'span') {
      cb(deserializeSpan(event.data.span))
    }
  }
  channel.addEventListener('message', handler)
  return () => {
    channel.removeEventListener('message', handler)
    channel.close()
  }
}

export function startSpan(name: string, parent?: Span, attrs?: Record<string, boolean | number | string>): Span {
  initIOTracer()

  const tracer = getIOTracer()
  const ctx = parent ? trace.setSpan(context.active(), parent) : undefined
  return tracer.startSpan(name, { attributes: attrs }, ctx)
}

export const activeTurnSpan = shallowRef<Span | undefined>()
