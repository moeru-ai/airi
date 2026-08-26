export const DoubaoSpeechMessageType = {
  FullClientRequest: 0b0001,
  FullServerResponse: 0b1001,
  AudioOnlyServer: 0b1011,
  Error: 0b1111,
} as const

export const DoubaoSpeechEvent = {
  StartConnection: 1,
  FinishConnection: 2,
  ConnectionStarted: 50,
  ConnectionFailed: 51,
  ConnectionFinished: 52,
  StartSession: 100,
  CancelSession: 101,
  FinishSession: 102,
  SessionStarted: 150,
  SessionCanceled: 151,
  SessionFinished: 152,
  SessionFailed: 153,
  TaskRequest: 200,
  TTSSentenceStart: 350,
  TTSSentenceEnd: 351,
  TTSResponse: 352,
  TTSSubtitle: 364,
} as const

export type DoubaoSpeechEventValue = typeof DoubaoSpeechEvent[keyof typeof DoubaoSpeechEvent]
export type DoubaoSpeechMessageTypeValue = typeof DoubaoSpeechMessageType[keyof typeof DoubaoSpeechMessageType]

export interface DoubaoSpeechClientEvent {
  event: DoubaoSpeechEventValue
  payload: Uint8Array
  sessionId?: string
}

export interface DoubaoSpeechMessage {
  compression: number
  connectId: string | undefined
  errorCode: number | undefined
  event: number | undefined
  messageType: number
  payload: Uint8Array
  sequence: number | undefined
  serialization: number
  sessionId: string | undefined
}

const VERSION_AND_HEADER_SIZE = 0x11
const JSON_WITH_EVENT_HEADER = 0x14
const SERIALIZATION_JSON = 0x10
const HEADER_SIZE = 4
const FLAG_POSITIVE_SEQUENCE = 0b0001
const FLAG_NEGATIVE_SEQUENCE = 0b0011
const FLAG_WITH_EVENT = 0b0100

const connectionRequestEvents = new Set<number>([
  DoubaoSpeechEvent.StartConnection,
  DoubaoSpeechEvent.FinishConnection,
])

const connectionResponseEvents = new Set<number>([
  DoubaoSpeechEvent.ConnectionStarted,
  DoubaoSpeechEvent.ConnectionFailed,
  DoubaoSpeechEvent.ConnectionFinished,
])

function assertAvailable(data: Uint8Array, offset: number, length: number, field: string) {
  if (length < 0 || offset + length > data.byteLength)
    throw new RangeError(`Doubao speech ${field} exceeds the frame length.`)
}

function readUint32(data: Uint8Array, offset: number, field: string) {
  assertAvailable(data, offset, 4, field)
  return new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0)
}

function readInt32(data: Uint8Array, offset: number, field: string) {
  assertAvailable(data, offset, 4, field)
  return new DataView(data.buffer, data.byteOffset + offset, 4).getInt32(0)
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer, target.byteOffset + offset, 4).setUint32(0, value)
}

function writeInt32(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer, target.byteOffset + offset, 4).setInt32(0, value)
}

function readSizedText(data: Uint8Array, offset: number, field: string) {
  const length = readUint32(data, offset, `${field} length`)
  const valueOffset = offset + 4
  assertAvailable(data, valueOffset, length, field)
  return {
    nextOffset: valueOffset + length,
    value: new TextDecoder().decode(data.subarray(valueOffset, valueOffset + length)),
  }
}

/**
 * Encodes one client event with the binary v1 frame used by Doubao Speech v3.
 *
 * The session identifier is required for session and synthesis events. Connection
 * events do not include it.
 */
export function encodeDoubaoSpeechClientEvent(input: DoubaoSpeechClientEvent) {
  const sessionId = input.sessionId ?? ''
  const sessionIdBytes = new TextEncoder().encode(sessionId)
  const includesSessionId = !connectionRequestEvents.has(input.event)
  if (includesSessionId && sessionIdBytes.byteLength === 0)
    throw new TypeError('Doubao speech session events require a session id.')

  const sessionBytes = includesSessionId ? 4 + sessionIdBytes.byteLength : 0
  const output = new Uint8Array(HEADER_SIZE + 4 + sessionBytes + 4 + input.payload.byteLength)
  output.set([
    VERSION_AND_HEADER_SIZE,
    JSON_WITH_EVENT_HEADER,
    SERIALIZATION_JSON,
    0,
  ])

  let offset = HEADER_SIZE
  writeInt32(output, offset, input.event)
  offset += 4

  if (includesSessionId) {
    writeUint32(output, offset, sessionIdBytes.byteLength)
    offset += 4
    output.set(sessionIdBytes, offset)
    offset += sessionIdBytes.byteLength
  }

  writeUint32(output, offset, input.payload.byteLength)
  offset += 4
  output.set(input.payload, offset)
  return output
}

/**
 * Decodes one complete server frame from the Doubao Speech v3 WebSocket.
 *
 * The returned payload stays binary. The session service decides whether the
 * event contains audio or JSON control data.
 */
export function decodeDoubaoSpeechMessage(data: Uint8Array): DoubaoSpeechMessage {
  assertAvailable(data, 0, HEADER_SIZE, 'header')

  const version = data[0] >> 4
  if (version !== 1)
    throw new TypeError(`Unsupported Doubao speech protocol version: ${version}.`)

  const headerSize = (data[0] & 0b0000_1111) * 4
  if (headerSize < HEADER_SIZE)
    throw new RangeError(`Invalid Doubao speech header size: ${headerSize}.`)
  assertAvailable(data, 0, headerSize, 'header')

  const messageType = data[1] >> 4
  const flags = data[1] & 0b0000_1111
  const serialization = data[2] >> 4
  const compression = data[2] & 0b0000_1111
  let offset = headerSize
  let sequence: number | undefined
  let errorCode: number | undefined
  let event: number | undefined
  let sessionId: string | undefined
  let connectId: string | undefined

  if (flags === FLAG_POSITIVE_SEQUENCE || flags === FLAG_NEGATIVE_SEQUENCE) {
    sequence = readInt32(data, offset, 'sequence')
    offset += 4
  }

  if (messageType === DoubaoSpeechMessageType.Error) {
    errorCode = readUint32(data, offset, 'error code')
    offset += 4
  }

  if (flags === FLAG_WITH_EVENT) {
    event = readInt32(data, offset, 'event')
    offset += 4

    if (!connectionResponseEvents.has(event)) {
      const session = readSizedText(data, offset, 'session id')
      sessionId = session.value || undefined
      offset = session.nextOffset
    }

    if (connectionResponseEvents.has(event)) {
      const connection = readSizedText(data, offset, 'connection id')
      connectId = connection.value || undefined
      offset = connection.nextOffset
    }
  }

  const payloadLength = readUint32(data, offset, 'payload length')
  offset += 4
  assertAvailable(data, offset, payloadLength, 'payload')
  const payload = data.slice(offset, offset + payloadLength)
  offset += payloadLength

  if (offset !== data.byteLength)
    throw new RangeError('Doubao speech frame contains unexpected trailing data.')

  return {
    compression,
    connectId,
    errorCode,
    event,
    messageType,
    payload,
    sequence,
    serialization,
    sessionId,
  }
}
