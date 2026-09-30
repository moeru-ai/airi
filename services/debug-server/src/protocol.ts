import type { Message, Type } from 'protobufjs'

import { Buffer } from 'node:buffer'
import { join } from 'node:path'

import protobuf from 'protobufjs'

import { isInteger, isLosslessNumber, parse, stringify } from 'lossless-json'

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

const protoRoot = new protobuf.Root()
const protoDirectory = join(import.meta.dirname, '..', 'proto')
protoRoot.resolvePath = (_origin, target) => join(protoDirectory, target)
protoRoot.loadSync([
  'opentelemetry/proto/collector/logs/v1/logs_service.proto',
  'opentelemetry/proto/collector/trace/v1/trace_service.proto',
  'google/rpc/status.proto',
])
protoRoot.resolveAll()

const traceRequestType = protoRoot.lookupType('opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest')
const traceResponseType = protoRoot.lookupType('opentelemetry.proto.collector.trace.v1.ExportTraceServiceResponse')
const logsRequestType = protoRoot.lookupType('opentelemetry.proto.collector.logs.v1.ExportLogsServiceRequest')
const logsResponseType = protoRoot.lookupType('opentelemetry.proto.collector.logs.v1.ExportLogsServiceResponse')
const statusType = protoRoot.lookupType('google.rpc.Status')

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asObject(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {}
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asInteger(value: unknown, field: string): number {
  if (value === undefined)
    return 0
  if (isLosslessNumber(value)) {
    if (!isInteger(value.toString()))
      throw new Error(`${field} must be an integer`)
    const parsed = Number(value.toString())
    if (!Number.isSafeInteger(parsed))
      throw new Error(`${field} must be a safe integer`)
    return parsed
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error(`${field} must be an integer`)
  return value
}

function exactInteger(value: unknown, field: string): string {
  if (value === undefined)
    return '0'
  if (typeof value === 'string' && /^-?\d+$/.test(value))
    return value
  if (typeof value === 'number' && Number.isSafeInteger(value))
    return String(value)
  if (isLosslessNumber(value) && isInteger(value.toString()))
    return value.toString()
  throw new Error(`${field} must be an exact 64-bit integer`)
}

function decodeHexId(value: unknown, bytes: number, field: string, optional = false): Buffer {
  if (optional && (value === undefined || value === ''))
    return Buffer.alloc(0)
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-fA-F]{${bytes * 2}}$`).test(value))
    throw new Error(`${field} must be ${bytes} bytes of hexadecimal text`)
  return Buffer.from(value, 'hex')
}

function normalizeJsonValue(value: unknown): unknown {
  if (isLosslessNumber(value)) {
    if (!isInteger(value.toString()))
      return value.valueOf()
    const parsed = Number(value.toString())
    return Number.isSafeInteger(parsed) ? parsed : value.toString()
  }
  if (Array.isArray(value))
    return value.map(item => normalizeJsonValue(item))
  if (!isObject(value))
    return value

  const normalized: Record<string, unknown> = {}
  for (const [childKey, childValue] of Object.entries(value))
    normalized[childKey] = normalizeJsonValue(childValue)
  return normalized
}

function setKnownId(object: Record<string, unknown>, key: string, bytes: number, field: string, optional = false): void {
  if (object[key] !== undefined)
    object[key] = decodeHexId(object[key], bytes, field, optional)
}

function assertIntegerRange(value: unknown, field: string, minimum: bigint, maximum: bigint): void {
  if (value === undefined)
    return
  const text = exactInteger(value, field)
  const integer = BigInt(text)
  if (integer < minimum || integer > maximum)
    throw new Error(`${field} is outside its 64-bit range`)
}

function validateAnyValue(value: unknown, field: string): void {
  const object = asObject(value)
  assertIntegerRange(object.intValue, `${field}.intValue`, -9_223_372_036_854_775_808n, 9_223_372_036_854_775_807n)
  for (const [index, child] of asArray(asObject(object.arrayValue).values).entries())
    validateAnyValue(child, `${field}.arrayValue.values[${index}]`)
  for (const [index, entryValue] of asArray(asObject(object.kvlistValue).values).entries())
    validateAnyValue(asObject(entryValue).value, `${field}.kvlistValue.values[${index}].value`)
}

function validateAttributes(value: unknown, field: string): void {
  for (const [index, entryValue] of asArray(value).entries())
    validateAnyValue(asObject(entryValue).value, `${field}[${index}].value`)
}

function normalizeKnownJson(signal: Signal, root: Record<string, unknown>): Record<string, unknown> {
  const normalized = normalizeJsonValue(root)
  if (!isObject(normalized))
    throw new Error('OTLP JSON body must be an object')

  if (signal === 'span') {
    for (const resourceSpanValue of asArray(normalized.resourceSpans)) {
      validateAttributes(asObject(asObject(resourceSpanValue).resource).attributes, 'resource.attributes')
      for (const scopeSpanValue of asArray(asObject(resourceSpanValue).scopeSpans)) {
        validateAttributes(asObject(asObject(scopeSpanValue).scope).attributes, 'scope.attributes')
        for (const spanValue of asArray(asObject(scopeSpanValue).spans)) {
          const span = asObject(spanValue)
          setKnownId(span, 'traceId', 16, 'span.traceId')
          setKnownId(span, 'spanId', 8, 'span.spanId')
          setKnownId(span, 'parentSpanId', 8, 'span.parentSpanId', true)
          assertIntegerRange(span.startTimeUnixNano, 'span.startTimeUnixNano', 0n, 18_446_744_073_709_551_615n)
          assertIntegerRange(span.endTimeUnixNano, 'span.endTimeUnixNano', 0n, 18_446_744_073_709_551_615n)
          validateAttributes(span.attributes, 'span.attributes')
          for (const linkValue of asArray(span.links)) {
            const link = asObject(linkValue)
            setKnownId(link, 'traceId', 16, 'span.link.traceId')
            setKnownId(link, 'spanId', 8, 'span.link.spanId')
            validateAttributes(link.attributes, 'span.link.attributes')
          }
          for (const eventValue of asArray(span.events)) {
            const event = asObject(eventValue)
            assertIntegerRange(event.timeUnixNano, 'span.event.timeUnixNano', 0n, 18_446_744_073_709_551_615n)
            validateAttributes(event.attributes, 'span.event.attributes')
          }
        }
      }
    }
  }
  else {
    for (const resourceLogValue of asArray(normalized.resourceLogs)) {
      validateAttributes(asObject(asObject(resourceLogValue).resource).attributes, 'resource.attributes')
      for (const scopeLogValue of asArray(asObject(resourceLogValue).scopeLogs)) {
        validateAttributes(asObject(asObject(scopeLogValue).scope).attributes, 'scope.attributes')
        for (const logValue of asArray(asObject(scopeLogValue).logRecords)) {
          const log = asObject(logValue)
          setKnownId(log, 'traceId', 16, 'logRecord.traceId', true)
          setKnownId(log, 'spanId', 8, 'logRecord.spanId', true)
          assertIntegerRange(log.timeUnixNano, 'logRecord.timeUnixNano', 0n, 18_446_744_073_709_551_615n)
          assertIntegerRange(log.observedTimeUnixNano, 'logRecord.observedTimeUnixNano', 0n, 18_446_744_073_709_551_615n)
          validateAttributes(log.attributes, 'logRecord.attributes')
          validateAnyValue(log.body, 'logRecord.body')
        }
      }
    }
  }
  return normalized
}

function bytesToCanonicalJson(value: unknown, key = ''): unknown {
  if (Array.isArray(value))
    return value.map(item => bytesToCanonicalJson(item))
  if (!isObject(value))
    return value

  const canonical: Record<string, unknown> = {}
  for (const [childKey, childValue] of Object.entries(value)) {
    if ((childKey === 'traceId' || childKey === 'spanId' || childKey === 'parentSpanId') && childValue instanceof Uint8Array) {
      canonical[childKey] = Buffer.from(childValue).toString('hex')
    }
    else if (childValue instanceof Uint8Array) {
      canonical[childKey] = Buffer.from(childValue).toString('base64')
    }
    else {
      canonical[childKey] = bytesToCanonicalJson(childValue, key ? `${key}.${childKey}` : childKey)
    }
  }
  return canonical
}

function decodeRequest(signal: Signal, type: Type, body: Uint8Array, contentType: string): { canonical: Record<string, unknown>, persistedBody: Uint8Array } {
  let message: Message
  if (contentType === 'application/x-protobuf') {
    message = type.decode(body)
  }
  else {
    const parsed = parse(Buffer.from(body).toString('utf8'))
    if (!isObject(parsed))
      throw new Error('OTLP JSON body must be an object')
    validateJsonEnums(parsed)
    message = type.fromObject(normalizeKnownJson(signal, parsed))
  }

  const object = type.toObject(message, {
    bytes: Buffer,
    defaults: false,
    enums: Number,
    longs: String,
    oneofs: false,
  })
  const verification = type.verify(message)
  if (verification)
    throw new Error(verification)
  for (const resourceValue of asArray(object.resourceSpans)) {
    for (const scopeValue of asArray(asObject(resourceValue).scopeSpans)) {
      for (const spanValue of asArray(asObject(scopeValue).spans)) {
        const span = asObject(spanValue)
        for (const [field, length] of [['traceId', 16], ['spanId', 8]] as const) {
          const identifier = span[field]
          if (!(identifier instanceof Uint8Array) || identifier.length !== length || identifier.every(byte => byte === 0))
            throw new Error(`span.${field} must be a nonzero ${length}-byte identifier`)
        }
      }
    }
  }
  const canonical = bytesToCanonicalJson(object) as Record<string, unknown>
  return { canonical, persistedBody: body }
}

function validateJsonEnums(root: Record<string, unknown>): void {
  for (const resourceSpan of asArray(root.resourceSpans)) {
    for (const scopeSpan of asArray(asObject(resourceSpan).scopeSpans)) {
      for (const span of asArray(asObject(scopeSpan).spans)) {
        const spanObject = asObject(span)
        asInteger(spanObject.kind, 'span.kind')
        asInteger(asObject(spanObject.status).code, 'span.status.code')
      }
    }
  }
  for (const resourceLog of asArray(root.resourceLogs)) {
    for (const scopeLog of asArray(asObject(resourceLog).scopeLogs)) {
      for (const logRecord of asArray(asObject(scopeLog).logRecords))
        asInteger(asObject(logRecord).severityNumber, 'logRecord.severityNumber')
    }
  }
}

function anyValueToString(value: unknown): string {
  const object = asObject(value)
  if (typeof object.stringValue === 'string')
    return object.stringValue
  if (typeof object.intValue === 'string')
    return object.intValue
  if (typeof object.boolValue === 'boolean')
    return String(object.boolValue)
  return ''
}

function attributesToMap(value: unknown): Map<string, unknown> {
  const attributes = new Map<string, unknown>()
  for (const entry of asArray(value)) {
    const object = asObject(entry)
    const key = asString(object.key)
    if (key)
      attributes.set(key, object.value)
  }
  return attributes
}

function firstAttribute(attributes: Map<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = anyValueToString(attributes.get(key))
    if (value)
      return value
  }
  return ''
}

function resourceIdentity(resource: Record<string, unknown>): { serviceName: string, sourceId: string } {
  const attributes = attributesToMap(resource.attributes)
  const serviceName = firstAttribute(attributes, ['service.name'])
  const sourceId = firstAttribute(attributes, [
    'service.instance.id',
    'ai.moeru.airi.source_instance_id',
    'source_instance_id',
  ])
  return { serviceName, sourceId }
}

function recordIdentity(attributesValue: unknown, resourceSourceId: string): { eventId: string, sessionId: string, sourceId: string } {
  const attributes = attributesToMap(attributesValue)
  return {
    eventId: firstAttribute(attributes, ['event_id', 'ai.moeru.airi.event_id']),
    sessionId: firstAttribute(attributes, ['session_id', 'ai.moeru.airi.session_id']),
    sourceId: firstAttribute(attributes, ['source_instance_id', 'ai.moeru.airi.source_instance_id']) || resourceSourceId,
  }
}

function flattenTraces(root: Record<string, unknown>, receivedUnixNano: string): IngestRecord[] {
  const records: IngestRecord[] = []
  for (const resourceSpanValue of asArray(root.resourceSpans)) {
    const resourceSpan = asObject(resourceSpanValue)
    const resource = asObject(resourceSpan.resource)
    const resourceSchemaUrl = asString(resourceSpan.schemaUrl)
    const { serviceName, sourceId: resourceSourceId } = resourceIdentity(resource)
    for (const scopeSpanValue of asArray(resourceSpan.scopeSpans)) {
      const scopeSpan = asObject(scopeSpanValue)
      const scope = asObject(scopeSpan.scope)
      const scopeSchemaUrl = asString(scopeSpan.schemaUrl)
      for (const spanValue of asArray(scopeSpan.spans)) {
        const span = asObject(spanValue)
        const identity = recordIdentity(span.attributes, resourceSourceId)
        const status = asObject(span.status)
        records.push({
          eventId: identity.eventId,
          kind: 'span',
          name: asString(span.name),
          parentSpanId: asString(span.parentSpanId).toLowerCase(),
          rawJson: stringify(span) ?? '{}',
          receivedUnixNano,
          resourceJson: stringify(resource) ?? '{}',
          resourceSchemaUrl,
          scopeJson: stringify(scope) ?? '{}',
          scopeSchemaUrl,
          serviceName,
          sessionId: identity.sessionId,
          severityNumber: 0,
          severityText: '',
          sourceId: identity.sourceId,
          spanId: asString(span.spanId).toLowerCase(),
          spanStatusCode: asInteger(status.code, 'span.status.code'),
          spanEndTimeUnixNano: exactInteger(span.endTimeUnixNano, 'span.endTimeUnixNano'),
          timeUnixNano: exactInteger(span.startTimeUnixNano, 'span.startTimeUnixNano'),
          traceId: asString(span.traceId).toLowerCase(),
        })
      }
    }
  }
  return records
}

function flattenLogs(root: Record<string, unknown>, receivedUnixNano: string): IngestRecord[] {
  const records: IngestRecord[] = []
  for (const resourceLogValue of asArray(root.resourceLogs)) {
    const resourceLog = asObject(resourceLogValue)
    const resource = asObject(resourceLog.resource)
    const resourceSchemaUrl = asString(resourceLog.schemaUrl)
    const { serviceName, sourceId: resourceSourceId } = resourceIdentity(resource)
    for (const scopeLogValue of asArray(resourceLog.scopeLogs)) {
      const scopeLog = asObject(scopeLogValue)
      const scope = asObject(scopeLog.scope)
      const scopeSchemaUrl = asString(scopeLog.schemaUrl)
      for (const logValue of asArray(scopeLog.logRecords)) {
        const log = asObject(logValue)
        const identity = recordIdentity(log.attributes, resourceSourceId)
        records.push({
          eventId: identity.eventId,
          kind: 'log',
          name: asString(log.eventName) || firstAttribute(attributesToMap(log.attributes), ['event.name', 'event_name']),
          parentSpanId: '',
          rawJson: stringify(log) ?? '{}',
          receivedUnixNano,
          resourceJson: stringify(resource) ?? '{}',
          resourceSchemaUrl,
          scopeJson: stringify(scope) ?? '{}',
          scopeSchemaUrl,
          serviceName,
          sessionId: identity.sessionId,
          severityNumber: asInteger(log.severityNumber, 'logRecord.severityNumber'),
          severityText: asString(log.severityText),
          sourceId: identity.sourceId,
          spanId: asString(log.spanId).toLowerCase(),
          spanStatusCode: 0,
          spanEndTimeUnixNano: '0',
          timeUnixNano: exactInteger(log.timeUnixNano ?? log.observedTimeUnixNano, 'logRecord.timeUnixNano'),
          traceId: asString(log.traceId).toLowerCase(),
        })
      }
    }
  }
  return records
}

export function decodeOtlp(signal: Signal, body: Uint8Array, contentType: string, receivedUnixNano: string): DecodedBatch {
  const decoded = decodeRequest(signal, signal === 'span' ? traceRequestType : logsRequestType, body, contentType)
  return {
    persistedBody: decoded.persistedBody,
    records: signal === 'span' ? flattenTraces(decoded.canonical, receivedUnixNano) : flattenLogs(decoded.canonical, receivedUnixNano),
  }
}

function responseType(signal: Signal): Type {
  return signal === 'span' ? traceResponseType : logsResponseType
}

export function encodeOtlpResponse(signal: Signal, contentType: string, rejected: number, message: string): Uint8Array | string {
  const payload = rejected > 0
    ? { partialSuccess: signal === 'span' ? { errorMessage: message, rejectedSpans: String(rejected) } : { errorMessage: message, rejectedLogRecords: String(rejected) } }
    : {}
  if (contentType === 'application/json')
    return JSON.stringify(payload)
  const type = responseType(signal)
  return type.encode(type.fromObject(payload)).finish()
}

export function encodeStatus(contentType: string, code: number, message: string): Uint8Array | string {
  const payload = { code, message }
  if (contentType === 'application/json')
    return JSON.stringify(payload)
  return statusType.encode(statusType.fromObject(payload)).finish()
}
