import type { Span, SpanContext, SpanStatusCode } from '@opentelemetry/api'
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import type { TimedEvent } from '@opentelemetry/sdk-trace-base/build/esm/TimedEvent'

import { context, trace } from '@opentelemetry/api'
import { hrTimeToNanoseconds } from '@opentelemetry/core'
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { shallowRef } from 'vue'

export type { ReadableSpan } from '@opentelemetry/sdk-trace-base'

const TRACER_NAME = 'ai.moeru.airi.io-tracer'
const BROADCAST_CHANNEL = 'io-tracer-channel' // TODO: Use simple BroadcastChannel for now

export interface SerializedSpan {
  traceId: string
  spanId: string
  parentSpanId: string
  name: string
  kind: number
  startTimeNano: string
  endTimeNano: string
  attributes: Record<string, unknown>
  events: { name: string, timeNano: string, attributes: Record<string, unknown> }[]
  status: { code: number, message: string }
  ended: boolean
}

function serializeSpan(span: ReadableSpan): SerializedSpan {
  const ctx = span.spanContext()
  const parentCtx = span.parentSpanContext
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: parentCtx?.spanId ?? '',
    name: span.name,
    kind: span.kind,
    startTimeNano: String(hrTimeToNanoseconds(span.startTime)),
    endTimeNano: span.ended ? String(hrTimeToNanoseconds(span.endTime)) : '0',
    attributes: { ...span.attributes },
    events: span.events.map((e: TimedEvent) => ({
      name: e.name,
      timeNano: String(hrTimeToNanoseconds(e.time)),
      attributes: { ...e.attributes },
    })),
    status: { code: span.status.code, message: span.status.message ?? '' },
    ended: span.ended,
  }
}

export function deserializeSpan(s: SerializedSpan): ReadableSpan {
  const nanoToHr = (nano: string): [number, number] => {
    const n = Number(nano)
    return [Math.floor(n / 1e9), n % 1e9]
  }
  const spanCtx: SpanContext = {
    traceId: s.traceId,
    spanId: s.spanId,
    traceFlags: 1,
    isRemote: false,
  }
  const parentCtx: SpanContext | undefined = s.parentSpanId
    ? { traceId: s.traceId, spanId: s.parentSpanId, traceFlags: 1, isRemote: false }
    : undefined

  return {
    name: s.name,
    kind: s.kind,
    spanContext: () => spanCtx,
    parentSpanContext: parentCtx,
    startTime: nanoToHr(s.startTimeNano),
    endTime: nanoToHr(s.endTimeNano),
    status: { code: s.status.code as SpanStatusCode, message: s.status.message },
    attributes: s.attributes as Record<string, string | number | boolean>,
    links: [],
    events: s.events.map(e => ({
      name: e.name,
      time: nanoToHr(e.timeNano),
      attributes: e.attributes as Record<string, string | number | boolean>,
      droppedAttributesCount: 0,
    })),
    duration: nanoToHr(String(Number(s.endTimeNano) - Number(s.startTimeNano))),
    ended: s.ended,
    resource: { attributes: {}, merge: () => ({ attributes: {} }) } as any,
    instrumentationScope: { name: TRACER_NAME },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  }
}

type SpanCallback = (span: ReadableSpan) => void

let provider: BasicTracerProvider | undefined
let spanCallback: SpanCallback | undefined
let broadcastChannel: BroadcastChannel | undefined

export function createCallbackSpanExporter(): SpanExporter {
  return {
    export: (spans, resultCallback) => {
      for (const span of spans) {
        spanCallback?.(span)

        broadcastChannel?.postMessage({
          type: 'span',
          span: serializeSpan(span),
        })
      }
      resultCallback({ code: 0 /* SUCCESS */ })
    },
    shutdown: () => Promise.resolve(),
    forceFlush: () => Promise.resolve(),
  }
}

export function initIOTracer() {
  if (!broadcastChannel)
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL)

  if (provider)
    return

  provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(createCallbackSpanExporter())],
  })
  trace.setGlobalTracerProvider(provider)
}

export function getIOTracer() {
  if (provider)
    return provider.getTracer(TRACER_NAME)
  return trace.getTracer(TRACER_NAME)
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

export function startSpan(name: string, parent?: Span, attrs?: Record<string, string | number | boolean>): Span {
  initIOTracer()

  const tracer = getIOTracer()
  const ctx = parent ? trace.setSpan(context.active(), parent) : undefined
  return tracer.startSpan(name, { attributes: attrs }, ctx)
}

export const activeTurnSpan = shallowRef<Span | undefined>()
