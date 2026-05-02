import { nanoid } from 'nanoid'

export interface TraceContext {
  traceId: string
  spanId: string
  parentSpanId?: string
  startedAt: number
}

export function createTrace(): TraceContext {
  return {
    traceId: nanoid(16),
    spanId: nanoid(8),
    startedAt: Date.now(),
  }
}

export function createChildSpan(parent: TraceContext): TraceContext {
  return {
    traceId: parent.traceId,
    spanId: nanoid(8),
    parentSpanId: parent.spanId,
    startedAt: Date.now(),
  }
}

export function elapsed(ctx: TraceContext): number {
  return Date.now() - ctx.startedAt
}
