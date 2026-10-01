import type { Context, Span, SpanContext, SpanStatusCode } from '@opentelemetry/api'
import type { ReadableSpan, Span as SdkSpan, SpanExporter, SpanProcessor } from '@opentelemetry/sdk-trace-base'
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

type SpanCallback = (span: ReadableSpan) => void

export interface DebugTracingConnection {
  endpoint: string
  token: string
}

class SwitchableSpanProcessor implements SpanProcessor {
  private processor: SpanProcessor | undefined
  private transition = Promise.resolve()

  constructor(processor?: SpanProcessor) {
    this.processor = processor
  }

  onStart(span: SdkSpan, parentContext: Context): void {
    this.processor?.onStart(span, parentContext)
  }

  onEnd(span: ReadableSpan): void {
    this.processor?.onEnd(span)
  }

  forceFlush(): Promise<void> {
    return this.processor?.forceFlush() ?? Promise.resolve()
  }

  shutdown(): Promise<void> {
    return this.replace(undefined)
  }

  replace(processor: SpanProcessor | undefined): Promise<void> {
    const previousProcessor = this.processor
    this.processor = processor
    if (!previousProcessor)
      return Promise.resolve()

    const shutdown = async () => {
      await previousProcessor.forceFlush()
      await previousProcessor.shutdown()
    }
    const operation = this.transition.then(shutdown, shutdown)
    this.transition = operation.then(() => undefined, () => undefined)
    return operation
  }
}

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

function createDebugSpanProcessor(connection: DebugTracingConnection): SpanProcessor {
  let endpointUrl: URL
  try {
    endpointUrl = new URL(connection.endpoint)
  }
  catch (error) {
    throw new TypeError('The local debug OTLP endpoint is invalid.', { cause: error })
  }
  if (!['http:', 'https:'].includes(endpointUrl.protocol)
    || endpointUrl.username
    || endpointUrl.password
    || endpointUrl.search
    || endpointUrl.hash
    || !['127.0.0.1', '[::1]', 'localhost'].includes(endpointUrl.hostname)) {
    throw new TypeError('The local debug OTLP endpoint must use HTTP and a loopback host.')
  }

  if (!endpointUrl.pathname.endsWith('/v1/traces'))
    endpointUrl.pathname = `${endpointUrl.pathname.replace(/\/$/, '')}/v1/traces`
  const exporter = new OTLPTraceExporter({
    headers: { Authorization: `Bearer ${connection.token}` },
    url: endpointUrl.toString(),
  })
  return new BatchSpanProcessor(exporter, {
    exportTimeoutMillis: 5000,
    maxExportBatchSize: 100,
    maxQueueSize: 2048,
    scheduledDelayMillis: 250,
  })
}

function createEnvironmentDebugSpanProcessor(): SpanProcessor | undefined {
  if (!import.meta.env.DEV)
    return undefined
  const endpoint = import.meta.env.VITE_AIRI_DEBUG_OTLP_ENDPOINT?.trim()
  const token = import.meta.env.VITE_AIRI_DEBUG_TOKEN?.trim()
  if (!endpoint || !token)
    return undefined
  return createDebugSpanProcessor({ endpoint, token })
}

const debugSpanProcessor = new SwitchableSpanProcessor(createEnvironmentDebugSpanProcessor())

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

  provider = new BasicTracerProvider({
    resource: resourceFromAttributes({
      'service.instance.id': crypto.randomUUID(),
      'service.name': 'airi-stage-ui',
    }),
    spanProcessors: [new SimpleSpanProcessor(createCallbackSpanExporter()), debugSpanProcessor],
  })
  trace.setGlobalTracerProvider(provider)
}

export async function configureDebugTracing(connection: DebugTracingConnection | undefined): Promise<void> {
  initIOTracer()
  const processor = connection ? createDebugSpanProcessor(connection) : undefined
  await debugSpanProcessor.replace(processor)
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
