import type { InferOutput } from 'valibot'

import { array, integer, maxLength, minLength, minValue, nullable, number, object, optional, picklist, pipe, record, regex, string, unknown } from 'valibot'

const hexId = (length: number) => pipe(string(), regex(new RegExp(`^[0-9a-f]{${length}}$`)))
const timestamp = pipe(number(), integer(), minValue(0))

export const agentTraceSpanSchema = object({
  traceId: hexId(32),
  spanId: hexId(16),
  parentSpanId: optional(nullable(hexId(16))),
  name: pipe(string(), maxLength(128)),
  startTimeUnixMs: timestamp,
  endTimeUnixMs: optional(nullable(timestamp)),
  status: picklist(['ok', 'error']),
  /** Any value is accepted here. The ingest keeps only allowlisted keys with short scalar values, and drops the rest, so a newer client does not lose a span. */
  attributes: optional(record(string(), unknown()), {}),
})

export const agentTraceUploadSchema = object({
  resource: object({
    appSurface: picklist(['web', 'electron', 'mobile']),
    appVersion: optional(pipe(string(), maxLength(64))),
  }),
  spans: pipe(array(agentTraceSpanSchema), minLength(1), maxLength(500)),
})

export type AgentTraceUpload = InferOutput<typeof agentTraceUploadSchema>
export type AgentTraceUploadSpan = InferOutput<typeof agentTraceSpanSchema>
