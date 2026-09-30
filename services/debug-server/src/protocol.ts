import type { AnyValue, InstrumentationScope, KeyValue } from '@buf/opentelemetry_opentelemetry.bufbuild_es/opentelemetry/proto/common/v1/common_pb.js'
import type { LogRecord } from '@buf/opentelemetry_opentelemetry.bufbuild_es/opentelemetry/proto/logs/v1/logs_pb.js'
import type { Resource } from '@buf/opentelemetry_opentelemetry.bufbuild_es/opentelemetry/proto/resource/v1/resource_pb.js'
import type { Span } from '@buf/opentelemetry_opentelemetry.bufbuild_es/opentelemetry/proto/trace/v1/trace_pb.js'
import type { DescMessage, JsonValue, MessageShape } from '@bufbuild/protobuf'

import { Buffer } from 'node:buffer'

import { StatusSchema } from '@buf/googleapis_googleapis.bufbuild_es/google/rpc/status_pb.js'
import { ExportLogsServiceRequestSchema, ExportLogsServiceResponseSchema } from '@buf/opentelemetry_opentelemetry.bufbuild_es/opentelemetry/proto/collector/logs/v1/logs_service_pb.js'
import { ExportTraceServiceRequestSchema, ExportTraceServiceResponseSchema } from '@buf/opentelemetry_opentelemetry.bufbuild_es/opentelemetry/proto/collector/trace/v1/trace_service_pb.js'
import { InstrumentationScopeSchema } from '@buf/opentelemetry_opentelemetry.bufbuild_es/opentelemetry/proto/common/v1/common_pb.js'
import { LogRecordSchema } from '@buf/opentelemetry_opentelemetry.bufbuild_es/opentelemetry/proto/logs/v1/logs_pb.js'
import { ResourceSchema } from '@buf/opentelemetry_opentelemetry.bufbuild_es/opentelemetry/proto/resource/v1/resource_pb.js'
import { SpanSchema } from '@buf/opentelemetry_opentelemetry.bufbuild_es/opentelemetry/proto/trace/v1/trace_pb.js'
import { create, fromBinary, fromJson, toBinary, toJsonString } from '@bufbuild/protobuf'

export type OtlpContentType = 'application/json' | 'application/x-protobuf'
export type Signal = 'log' | 'span'

export interface IngestRecord {
  eventId: string
  kind: Signal
  name: string
  parentSpanId: string
  rawJson: string
  receivedUnixNano: string
  resourceJson: string
  resourceSchemaUrl: string
  scopeJson: string
  scopeSchemaUrl: string
  serviceName: string
  sessionId: string
  severityNumber: number
  severityText: string
  sourceId: string
  spanId: string
  spanStatusCode: number
  spanEndTimeUnixNano: string
  timeUnixNano: string
  traceId: string
}

interface DecodedBatch {
  persistedBody: Uint8Array
  records: IngestRecord[]
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`${field} must be an object`)
  return value as Record<string, unknown>
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function decimalString(value: unknown, field: string): void {
  if (value !== undefined && (typeof value !== 'string' || !/^\d+$/.test(value)))
    throw new Error(`${field} must be a decimal string`)
}

function numericEnum(value: unknown, field: string): void {
  if (value !== undefined && (typeof value !== 'number' || !Number.isSafeInteger(value)))
    throw new Error(`${field} must be an integer`)
}

function normalizeHexIdentifier(owner: Record<string, unknown>, field: string, bytes: number, required = false): void {
  const value = owner[field]
  if (!required && (value === undefined || value === ''))
    return
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-fA-F]{${bytes * 2}}$`).test(value))
    throw new Error(`${field} must be ${bytes} bytes of hexadecimal text`)
  owner[field] = Buffer.from(value, 'hex').toString('base64')
}

function validateAnyValue(value: unknown, field: string): void {
  const anyValue = record(value, field)
  if (anyValue.intValue !== undefined && (typeof anyValue.intValue !== 'string' || !/^-?\d+$/.test(anyValue.intValue)))
    throw new Error(`${field}.intValue must be a decimal string`)
  for (const [index, child] of array(record(anyValue.arrayValue ?? {}, `${field}.arrayValue`).values).entries())
    validateAnyValue(child, `${field}.arrayValue.values[${index}]`)
  for (const [index, entry] of array(record(anyValue.kvlistValue ?? {}, `${field}.kvlistValue`).values).entries()) {
    const entryValue = record(entry, `${field}.kvlistValue.values[${index}]`).value
    if (entryValue !== undefined)
      validateAnyValue(entryValue, `${field}.kvlistValue.values[${index}].value`)
  }
}

function validateAttributes(value: unknown, field: string): void {
  for (const [index, entry] of array(value).entries()) {
    const attribute = record(entry, `${field}[${index}]`)
    if (attribute.value !== undefined)
      validateAnyValue(attribute.value, `${field}[${index}].value`)
  }
}

function normalizeTraceJson(root: Record<string, unknown>): void {
  for (const resourceSpanValue of array(root.resourceSpans)) {
    const resourceSpan = record(resourceSpanValue, 'resourceSpans[]')
    validateAttributes(record(resourceSpan.resource ?? {}, 'resource').attributes, 'resource.attributes')
    for (const scopeSpanValue of array(resourceSpan.scopeSpans)) {
      const scopeSpan = record(scopeSpanValue, 'scopeSpans[]')
      validateAttributes(record(scopeSpan.scope ?? {}, 'scope').attributes, 'scope.attributes')
      for (const spanValue of array(scopeSpan.spans)) {
        const span = record(spanValue, 'spans[]')
        normalizeHexIdentifier(span, 'traceId', 16, true)
        normalizeHexIdentifier(span, 'spanId', 8, true)
        normalizeHexIdentifier(span, 'parentSpanId', 8)
        decimalString(span.startTimeUnixNano, 'span.startTimeUnixNano')
        decimalString(span.endTimeUnixNano, 'span.endTimeUnixNano')
        numericEnum(span.kind, 'span.kind')
        numericEnum(record(span.status ?? {}, 'span.status').code, 'span.status.code')
        validateAttributes(span.attributes, 'span.attributes')
        for (const eventValue of array(span.events)) {
          const event = record(eventValue, 'span.events[]')
          decimalString(event.timeUnixNano, 'span.event.timeUnixNano')
          validateAttributes(event.attributes, 'span.event.attributes')
        }
        for (const linkValue of array(span.links)) {
          const link = record(linkValue, 'span.links[]')
          normalizeHexIdentifier(link, 'traceId', 16, true)
          normalizeHexIdentifier(link, 'spanId', 8, true)
          validateAttributes(link.attributes, 'span.link.attributes')
        }
      }
    }
  }
}

function normalizeLogsJson(root: Record<string, unknown>): void {
  for (const resourceLogValue of array(root.resourceLogs)) {
    const resourceLog = record(resourceLogValue, 'resourceLogs[]')
    validateAttributes(record(resourceLog.resource ?? {}, 'resource').attributes, 'resource.attributes')
    for (const scopeLogValue of array(resourceLog.scopeLogs)) {
      const scopeLog = record(scopeLogValue, 'scopeLogs[]')
      validateAttributes(record(scopeLog.scope ?? {}, 'scope').attributes, 'scope.attributes')
      for (const logValue of array(scopeLog.logRecords)) {
        const log = record(logValue, 'logRecords[]')
        normalizeHexIdentifier(log, 'traceId', 16)
        normalizeHexIdentifier(log, 'spanId', 8)
        decimalString(log.timeUnixNano, 'logRecord.timeUnixNano')
        decimalString(log.observedTimeUnixNano, 'logRecord.observedTimeUnixNano')
        numericEnum(log.severityNumber, 'logRecord.severityNumber')
        validateAttributes(log.attributes, 'logRecord.attributes')
        if (log.body !== undefined)
          validateAnyValue(log.body, 'logRecord.body')
      }
    }
  }
}

function decodeRequest(signal: Signal, body: Uint8Array, contentType: OtlpContentType) {
  const schema = signal === 'span' ? ExportTraceServiceRequestSchema : ExportLogsServiceRequestSchema
  if (contentType === 'application/x-protobuf')
    return fromBinary(schema, body)

  const parsed = record(JSON.parse(Buffer.from(body).toString('utf8')), 'OTLP JSON body')
  if (signal === 'span')
    normalizeTraceJson(parsed)
  else
    normalizeLogsJson(parsed)
  return fromJson(schema, parsed as JsonValue, { ignoreUnknownFields: true })
}

function hex(value: Uint8Array): string {
  return Buffer.from(value).toString('hex')
}

function jsonObject<Schema extends DescMessage>(schema: Schema, message: MessageShape<Schema>): Record<string, unknown> {
  return JSON.parse(toJsonString(schema, message, { enumAsInteger: true })) as Record<string, unknown>
}

function spanJson(span: Span): string {
  const json = jsonObject(SpanSchema, span)
  json.traceId = hex(span.traceId)
  json.spanId = hex(span.spanId)
  if (span.parentSpanId.length > 0)
    json.parentSpanId = hex(span.parentSpanId)
  const links = array(json.links)
  for (const [index, link] of span.links.entries()) {
    const linkJson = record(links[index], `span.links[${index}]`)
    linkJson.traceId = hex(link.traceId)
    linkJson.spanId = hex(link.spanId)
  }
  return JSON.stringify(json)
}

function logJson(log: LogRecord): string {
  const json = jsonObject(LogRecordSchema, log)
  if (log.traceId.length > 0)
    json.traceId = hex(log.traceId)
  if (log.spanId.length > 0)
    json.spanId = hex(log.spanId)
  return JSON.stringify(json)
}

function anyValueString(value: AnyValue | undefined): string {
  if (value?.value.case === 'stringValue')
    return value.value.value
  if (value?.value.case === 'intValue' || value?.value.case === 'boolValue')
    return String(value.value.value)
  return ''
}

function attributesMap(attributes: KeyValue[]): Map<string, AnyValue | undefined> {
  return new Map(attributes.map(attribute => [attribute.key, attribute.value]))
}

function firstAttribute(attributes: Map<string, AnyValue | undefined>, keys: string[]): string {
  for (const key of keys) {
    const value = anyValueString(attributes.get(key))
    if (value)
      return value
  }
  return ''
}

function resourceIdentity(resource: Resource | undefined): { serviceName: string, sourceId: string } {
  const attributes = attributesMap(resource?.attributes ?? [])
  return {
    serviceName: firstAttribute(attributes, ['service.name']),
    sourceId: firstAttribute(attributes, ['service.instance.id', 'ai.moeru.airi.source_instance_id', 'source_instance_id']),
  }
}

function recordIdentity(attributes: KeyValue[], resourceSourceId: string): { eventId: string, sessionId: string, sourceId: string } {
  const values = attributesMap(attributes)
  return {
    eventId: firstAttribute(values, ['event_id', 'ai.moeru.airi.event_id']),
    sessionId: firstAttribute(values, ['session_id', 'ai.moeru.airi.session_id']),
    sourceId: firstAttribute(values, ['source_instance_id', 'ai.moeru.airi.source_instance_id']) || resourceSourceId,
  }
}

function scopeJson(scope: InstrumentationScope | undefined): string {
  return scope === undefined ? '{}' : toJsonString(InstrumentationScopeSchema, scope, { enumAsInteger: true })
}

function resourceJson(resource: Resource | undefined): string {
  return resource === undefined ? '{}' : toJsonString(ResourceSchema, resource, { enumAsInteger: true })
}

function assertSpanIdentifiers(span: Span): void {
  for (const [field, value, length] of [['traceId', span.traceId, 16], ['spanId', span.spanId, 8]] as const) {
    if (value.length !== length || value.every(byte => byte === 0))
      throw new Error(`span.${field} must be a nonzero ${length}-byte identifier`)
  }
}

function flattenTraces(request: MessageShape<typeof ExportTraceServiceRequestSchema>, receivedUnixNano: string): IngestRecord[] {
  return request.resourceSpans.flatMap((resourceSpans) => {
    const resource = resourceSpans.resource
    const resourceData = resourceJson(resource)
    const { serviceName, sourceId: resourceSourceId } = resourceIdentity(resource)
    return resourceSpans.scopeSpans.flatMap(scopeSpans => scopeSpans.spans.map((span) => {
      assertSpanIdentifiers(span)
      const identity = recordIdentity(span.attributes, resourceSourceId)
      return {
        eventId: identity.eventId,
        kind: 'span' as const,
        name: span.name,
        parentSpanId: hex(span.parentSpanId),
        rawJson: spanJson(span),
        receivedUnixNano,
        resourceJson: resourceData,
        resourceSchemaUrl: resourceSpans.schemaUrl,
        scopeJson: scopeJson(scopeSpans.scope),
        scopeSchemaUrl: scopeSpans.schemaUrl,
        serviceName,
        sessionId: identity.sessionId,
        severityNumber: 0,
        severityText: '',
        sourceId: identity.sourceId,
        spanEndTimeUnixNano: span.endTimeUnixNano.toString(),
        spanId: hex(span.spanId),
        spanStatusCode: span.status?.code ?? 0,
        timeUnixNano: span.startTimeUnixNano.toString(),
        traceId: hex(span.traceId),
      }
    }))
  })
}

function flattenLogs(request: MessageShape<typeof ExportLogsServiceRequestSchema>, receivedUnixNano: string): IngestRecord[] {
  return request.resourceLogs.flatMap((resourceLogs) => {
    const resource = resourceLogs.resource
    const resourceData = resourceJson(resource)
    const { serviceName, sourceId: resourceSourceId } = resourceIdentity(resource)
    return resourceLogs.scopeLogs.flatMap(scopeLogs => scopeLogs.logRecords.map((log) => {
      const identity = recordIdentity(log.attributes, resourceSourceId)
      return {
        eventId: identity.eventId,
        kind: 'log' as const,
        name: log.eventName || firstAttribute(attributesMap(log.attributes), ['event.name', 'event_name']),
        parentSpanId: '',
        rawJson: logJson(log),
        receivedUnixNano,
        resourceJson: resourceData,
        resourceSchemaUrl: resourceLogs.schemaUrl,
        scopeJson: scopeJson(scopeLogs.scope),
        scopeSchemaUrl: scopeLogs.schemaUrl,
        serviceName,
        sessionId: identity.sessionId,
        severityNumber: log.severityNumber,
        severityText: log.severityText,
        sourceId: identity.sourceId,
        spanEndTimeUnixNano: '0',
        spanId: hex(log.spanId),
        spanStatusCode: 0,
        timeUnixNano: (log.timeUnixNano || log.observedTimeUnixNano).toString(),
        traceId: hex(log.traceId),
      }
    }))
  })
}

export function decodeOtlp(signal: Signal, body: Uint8Array, contentType: OtlpContentType, receivedUnixNano: string): DecodedBatch {
  const request = decodeRequest(signal, body, contentType)
  return {
    persistedBody: body,
    records: signal === 'span'
      ? flattenTraces(request as MessageShape<typeof ExportTraceServiceRequestSchema>, receivedUnixNano)
      : flattenLogs(request as MessageShape<typeof ExportLogsServiceRequestSchema>, receivedUnixNano),
  }
}

export function encodeOtlpResponse(signal: Signal, contentType: OtlpContentType, rejected: number, message: string): Uint8Array<ArrayBuffer> | string {
  if (signal === 'span') {
    const response = create(ExportTraceServiceResponseSchema, rejected > 0 ? { partialSuccess: { errorMessage: message, rejectedSpans: BigInt(rejected) } } : {})
    return contentType === 'application/json' ? toJsonString(ExportTraceServiceResponseSchema, response) : toBinary(ExportTraceServiceResponseSchema, response)
  }
  const response = create(ExportLogsServiceResponseSchema, rejected > 0 ? { partialSuccess: { errorMessage: message, rejectedLogRecords: BigInt(rejected) } } : {})
  return contentType === 'application/json' ? toJsonString(ExportLogsServiceResponseSchema, response) : toBinary(ExportLogsServiceResponseSchema, response)
}

export function encodeStatus(contentType: OtlpContentType, code: number, message: string): Uint8Array<ArrayBuffer> | string {
  const status = create(StatusSchema, { code, message })
  return contentType === 'application/json' ? toJsonString(StatusSchema, status) : toBinary(StatusSchema, status)
}
