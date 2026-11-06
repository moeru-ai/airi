import type { GenericSchema } from 'valibot'

import type { TraceRecord } from './types'

import {
  array,
  boolean,
  check,
  finite,
  integer,
  literal,
  maxLength,
  minValue,
  nonEmpty,
  number,
  object,
  optional,
  picklist,
  pipe,
  record,
  regex,
  string,
  union,
  unknown,
  variant,
} from 'valibot'

const nonEmptyString = pipe(string(), nonEmpty())

/**
 * The most points in one `sample.chunk`, over all its series. A chunk holds about one second, so this is above 4 kHz
 * for one series. Series rings sit outside the byte limit of the buffer, so an untrusted chunk must be bounded here.
 */
export const MAX_CHUNK_POINTS = 4096
const finiteNumber = pipe(number(), finite())
/** A source or an epoch. Keys join them with `/`, so a `/` inside would make two keys equal. */
const keyPart = pipe(string(), nonEmpty(), regex(/^[^/]+$/, 'A source or an epoch must not contain "/".'))

const assetRef = object({ $asset: nonEmptyString, mediaType: nonEmptyString, bytes: pipe(number(), integer(), minValue(0)) })
const value = union([string(), finiteNumber, boolean(), array(string()), array(finiteNumber), assetRef])
const ids = record(string(), union([string(), finiteNumber]))
const ref = object({ source: keyPart, epoch: keyPart, seq: pipe(number(), integer(), minValue(0)) })
const link = object({
  to: union([ref, object({ spanId: nonEmptyString }), object({ key: nonEmptyString, id: union([string(), finiteNumber]) })]),
  rel: nonEmptyString,
})
const status = picklist(['ok', 'error', 'cancelled'])

const untracked = {
  source: keyPart,
  epoch: keyPart,
  seq: pipe(number(), integer(), minValue(0)),
  ts: finiteNumber,
  clock: nonEmptyString,
  observedTs: optional(finiteNumber),
  ids: optional(ids),
  attrs: optional(record(string(), value)),
}

const tracked = {
  ...untracked,
  track: nonEmptyString,
  links: optional(array(link)),
  evidence: optional(picklist(['reported', 'observed'])),
}

/**
 * Validates one trace record at a trust boundary, such as IPC from a window or `trace:emit` from a plugin.
 * Producers inside one process do not validate their own records.
 */
export const traceRecordSchema = variant('type', [
  object({ ...untracked, type: literal('source.started'), format: pipe(number(), integer()), runtime: string(), profiles: array(object({ key: nonEmptyString, version: string() })) }),
  object({ ...untracked, type: literal('source.stopped') }),
  object({ ...untracked, type: literal('source.lost'), of: object({ source: keyPart, epoch: keyPart, lastSeq: number() }), reason: picklist(['ipc-closed', 'heartbeat-timeout', 'epoch-replaced']) }),
  object({ ...untracked, type: literal('clock.snapshot'), values: array(object({ clock: nonEmptyString, value: finiteNumber })), uncertaintyMs: pipe(finiteNumber, minValue(0)) }),
  object({ ...untracked, type: literal('clock.discontinuity'), of: nonEmptyString, reason: string() }),
  object({ ...untracked, type: literal('stream.started'), streamId: nonEmptyString, mediaType: nonEmptyString, rate: optional(finiteNumber), channels: optional(pipe(number(), integer())), uri: optional(string()) }),
  object({ ...untracked, type: literal('stream.stopped'), streamId: nonEmptyString }),
  object({ ...tracked, type: literal('span.begin'), spanId: nonEmptyString, parentSpanId: optional(nonEmptyString), name: string(), deadlineMs: optional(pipe(finiteNumber, minValue(0))) }),
  object({ ...tracked, type: literal('span.update'), spanId: nonEmptyString }),
  object({ ...tracked, type: literal('span.end'), spanId: nonEmptyString, status, reason: optional(string()), message: optional(string()) }),
  object({ ...tracked, type: literal('span.complete'), spanId: nonEmptyString, parentSpanId: optional(nonEmptyString), name: string(), durationMs: pipe(finiteNumber, minValue(0)), status, reason: optional(string()) }),
  object({ ...tracked, type: literal('instant'), name: string(), spanId: optional(nonEmptyString) }),
  object({ ...tracked, type: literal('state'), value: string(), from: optional(string()) }),
  object({ ...tracked, type: literal('sample'), values: record(string(), finiteNumber) }),
  object({ ...tracked, type: literal('sample.chunk'), intervalMs: optional(pipe(finiteNumber, minValue(0))), offsetsMs: optional(pipe(array(finiteNumber), maxLength(MAX_CHUNK_POINTS))), values: pipe(record(string(), array(finiteNumber)), check(values => Object.values(values).reduce((count, list) => count + list.length, 0) <= MAX_CHUNK_POINTS, `A sample chunk holds at most ${MAX_CHUNK_POINTS} points.`)) }),
  object({ ...tracked, type: literal('log'), level: picklist(['debug', 'info', 'warn', 'error']), message: string() }),
  object({ ...untracked, type: literal('definition'), kind: picklist(['track', 'attribute', 'id-key', 'link', 'end-reason', 'clock', 'metric', 'score', 'pipeline', 'preset', 'profile']), key: nonEmptyString, data: unknown() }),
  object({
    ...untracked,
    type: literal('annotation'),
    target: object({ ref: optional(ref), spanId: optional(nonEmptyString), ids: optional(ids) }),
    name: nonEmptyString,
    value: optional(value),
    label: optional(string()),
    explanation: optional(string()),
    annotator: object({ kind: picklist(['rule', 'model', 'human']), id: optional(string()), model: optional(string()), version: optional(string()) }),
  }),
]) satisfies GenericSchema<unknown, TraceRecord>
