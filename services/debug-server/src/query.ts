import { literal, maxValue, minValue, number, object, optional, picklist, pipe, regex, safeInteger, string, toLowerCase, transform, union } from 'valibot'

function unsigned(maximum: bigint) {
  return pipe(string(), regex(/^\d+$/), transform(value => BigInt(value)), maxValue(maximum), transform(value => String(value)))
}

const cursor = optional(union([literal(''), unsigned(9_223_372_036_854_775_807n)]), '')
const traceId = pipe(string(), regex(/^[\da-f]{32}$/i, 'traceId must be 16 bytes of hexadecimal text'), toLowerCase())
const spanId = pipe(string(), regex(/^[\da-f]{16}$/i, 'spanId must be 8 bytes of hexadecimal text'), toLowerCase())
const identity = optional(string())
const pageSize = pipe(optional(string(), '50'), transform(value => value === '' ? 50 : Number(value)), number(), safeInteger(), minValue(1), maxValue(200))

export const sourceQuery = object({ afterCursor: cursor, pageSize })
export const traceParams = object({ traceId })
export const eventQuery = object({
  ...sourceQuery.entries,
  traceId: optional(traceId),
  spanId: optional(spanId),
  sourceId: identity,
  sessionId: identity,
  kind: pipe(optional(picklist(['EVENT_KIND_UNSPECIFIED', 'EVENT_KIND_SPAN', 'EVENT_KIND_LOG'])), transform(value => value === 'EVENT_KIND_SPAN' ? 'span' : value === 'EVENT_KIND_LOG' ? 'log' : undefined)),
})
export const traceQuery = object({
  ...sourceQuery.entries,
  sourceId: identity,
  sessionId: identity,
  startedAfterUnixNano: pipe(
    optional(union([literal(''), unsigned(18_446_744_073_709_551_615n)]), ''),
    transform(value => value === '' ? undefined : value),
  ),
  state: pipe(optional(picklist(['TRACE_STATE_UNSPECIFIED', 'TRACE_STATE_INCOMPLETE', 'TRACE_STATE_COMPLETE', 'TRACE_STATE_ERROR'])), transform((value) => {
    switch (value) {
      case 'TRACE_STATE_INCOMPLETE': return 1
      case 'TRACE_STATE_COMPLETE': return 2
      case 'TRACE_STATE_ERROR': return 3
      default: return undefined
    }
  })),
})
export const exportQuery = object({
  afterCursor: cursor,
  pageSize: pipe(optional(string(), '200'), transform(value => value === '' ? 200 : Number(value)), number(), safeInteger(), minValue(1), maxValue(1000)),
})
