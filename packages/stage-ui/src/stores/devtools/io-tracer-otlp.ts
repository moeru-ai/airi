import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'

import { hrTimeToNanoseconds } from '@opentelemetry/core'

function formatOtlpValue(value: unknown): Record<string, unknown> {
  if (typeof value === 'string')
    return { stringValue: value }
  if (typeof value === 'number')
    return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value }
  if (typeof value === 'boolean')
    return { boolValue: value }
  if (Array.isArray(value))
    return { arrayValue: { values: value.map(v => formatOtlpValue(v)) } }
  return { stringValue: String(value) }
}

function formatOtlpAttributes(attributes: ReadableSpan['attributes']) {
  return Object.entries(attributes).map(([key, value]) => ({
    key,
    value: formatOtlpValue(value),
  }))
}

/**
 * Converts IO spans to an OTLP/JSON trace export request.
 *
 * OTel JS numbers `SpanKind` from `INTERNAL = 0`. OTLP reserves 0 for `SPAN_KIND_UNSPECIFIED` and starts at
 * `SPAN_KIND_INTERNAL = 1`, so each kind moves up by one. Status codes have the same numbers in both.
 *
 * Source: https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/trace/v1/trace.proto
 */
export function toOTLPTrace(spans: readonly ReadableSpan[]) {
  const scope = spans[0]?.instrumentationScope

  return {
    resourceSpans: [{
      resource: {
        attributes: [
          { key: 'service.name', value: { stringValue: 'airi-io' } },
        ],
      },
      scopeSpans: [{
        scope: { name: scope?.name ?? 'io', version: scope?.version },
        spans: spans.map((span) => {
          const ctx = span.spanContext()

          return {
            traceId: ctx.traceId,
            spanId: ctx.spanId,
            parentSpanId: span.parentSpanContext?.spanId ?? '',
            name: span.name,
            kind: span.kind + 1,
            startTimeUnixNano: String(hrTimeToNanoseconds(span.startTime)),
            endTimeUnixNano: span.ended ? String(hrTimeToNanoseconds(span.endTime)) : '0',
            attributes: formatOtlpAttributes(span.attributes),
            events: span.events.map(event => ({
              timeUnixNano: String(hrTimeToNanoseconds(event.time)),
              name: event.name,
              attributes: formatOtlpAttributes(event.attributes ?? {}),
            })),
            status: {
              code: span.status.code,
              message: span.status.message ?? '',
            },
          }
        }),
      }],
    }],
  }
}
