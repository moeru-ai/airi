import type { Span, SpanContext } from '@opentelemetry/api'
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import type { SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'

import { errorMessageFrom } from '@moeru/std'
import { context, SpanStatusCode, trace } from '@opentelemetry/api'
import { hrTimeToNanoseconds } from '@opentelemetry/core'
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { IOAttributes } from '@proj-airi/stage-shared'
import { shallowRef } from 'vue'

export type { ReadableSpan } from '@opentelemetry/sdk-trace-base'

const TRACER_NAME = 'ai.moeru.airi.io-tracer'
const BROADCAST_CHANNEL = 'io-tracer-channel' // TODO: Use simple BroadcastChannel for now

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

export function serializeSpan(span: ReadableSpan): SerializedIOSpan {
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
const spanSubscribers = new Set<SpanCallback>()
let broadcastChannel: BroadcastChannel | undefined

export function createCallbackSpanExporter(): SpanExporter {
  return {
    export: (spans, resultCallback) => {
      for (const span of spans) {
        spanCallback?.(span)
        for (const subscriber of spanSubscribers)
          subscriber(span)

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
    spanProcessors: [new SimpleSpanProcessor(createCallbackSpanExporter())],
  })
  trace.setGlobalTracerProvider(provider)
}

export function subscribeIOSpan(subscriber: SpanCallback): () => void {
  spanSubscribers.add(subscriber)
  return () => spanSubscribers.delete(subscriber)
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

/**
 * Runs `work` and ends `span` when it settles.
 *
 * A rejection after `signal` aborted is a cancellation that the caller chose, so the span gets the `Cancelled`
 * attribute and no error status. Any other rejection sets the error status. The rejection still reaches the caller.
 */
export async function runInSpan<T>(span: Span, signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  }
  catch (error) {
    if (signal.aborted)
      span.setAttribute(IOAttributes.Cancelled, true)
    else
      span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessageFrom(error) ?? 'Operation failed' })
    throw error
  }
  finally {
    span.end()
  }
}

/**
 * The span of the speech input that the voice host captures now.
 * Speech recognition, end judgements, and the rephrase of that input are its children.
 * The voice host sets it when an input starts and clears it when the input settles.
 */
export const activeVoiceInputSpan = shallowRef<Span | undefined>()

/**
 * Voice input spans by the chat turn ID that their submission uses.
 * A submission uses the input ID as the message ID, and the chat runtime uses the message ID as the turn ID.
 * The chat store takes the parent when it starts the `Interaction turn` span, so a spoken turn is one trace.
 */
const voiceTurnParents = new Map<string, Span>()

/** Recent submissions only. A draft that is never sent leaves its entry until newer inputs replace it. */
const MAX_VOICE_TURN_PARENTS = 32

export function linkVoiceTurn(turnId: string, span: Span) {
  voiceTurnParents.delete(turnId)
  voiceTurnParents.set(turnId, span)
  while (voiceTurnParents.size > MAX_VOICE_TURN_PARENTS)
    voiceTurnParents.delete(voiceTurnParents.keys().next().value!)
}

/** Returns the voice input span of a turn once. A typed turn has none. */
export function takeVoiceTurnParent(turnId: string): Span | undefined {
  const span = voiceTurnParents.get(turnId)
  voiceTurnParents.delete(turnId)
  return span
}
