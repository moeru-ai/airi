export const DOUBAO_REALTIME_PROTOCOL_VERSION = 0x1
export const DOUBAO_REALTIME_HEADER_SIZE_WORDS = 0x1

export const enum DoubaoRealtimeMessageType {
  FullClientRequest = 0x1,
  AudioOnlyRequest = 0x2,
  FullServerResponse = 0x9,
  AudioOnlyResponse = 0xB,
  ErrorInformation = 0xF,
}

export const enum DoubaoRealtimeSerializationMethod {
  Raw = 0x0,
  JSON = 0x1,
}

export const enum DoubaoRealtimeCompressionMethod {
  None = 0x0,
  Gzip = 0x1,
}

export const DOUBAO_REALTIME_EVENT_FLAG = 0b0100

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

export interface BuildDoubaoRealtimeFrameOptions {
  messageType: DoubaoRealtimeMessageType
  messageFlags?: number
  serialization?: DoubaoRealtimeSerializationMethod
  compression?: DoubaoRealtimeCompressionMethod
  errorCode?: number
  sequence?: number
  event?: number
  connectId?: string
  sessionId?: string
  payload?: string | Uint8Array | ArrayBuffer | null | undefined
}

export interface ParsedDoubaoRealtimeFrame {
  protocolVersion: number
  headerSizeWords: number
  messageType: DoubaoRealtimeMessageType
  messageFlags: number
  serialization: DoubaoRealtimeSerializationMethod
  compression: DoubaoRealtimeCompressionMethod
  errorCode?: number
  sequence?: number
  event?: number
  connectId?: string
  sessionId?: string
  payloadSize: number
  payload: Uint8Array
}

function toUint8Array(payload: BuildDoubaoRealtimeFrameOptions['payload']): Uint8Array {
  if (payload == null)
    return new Uint8Array(0)

  if (typeof payload === 'string')
    return textEncoder.encode(payload)

  if (payload instanceof Uint8Array)
    return payload

  if (payload instanceof ArrayBuffer)
    return new Uint8Array(payload)

  throw new TypeError('Unsupported Doubao realtime payload type.')
}

function writeInt32(buffer: Uint8Array, offset: number, value: number) {
  new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).setInt32(offset, value, false)
}

function readInt32(buffer: Uint8Array, offset: number): number {
  return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength).getInt32(offset, false)
}

function maybeEncodeString(value?: string): Uint8Array {
  return value ? textEncoder.encode(value) : new Uint8Array(0)
}

function hasSequenceField(messageFlags: number) {
  const sequenceMode = messageFlags & 0b0011
  return sequenceMode === 0b0001 || sequenceMode === 0b0011
}

export function buildDoubaoRealtimeFrame(options: BuildDoubaoRealtimeFrameOptions): Uint8Array {
  const messageFlags = options.messageFlags ?? 0
  const payload = toUint8Array(options.payload)
  const connectId = maybeEncodeString(options.connectId)
  const sessionId = maybeEncodeString(options.sessionId)
  const hasEvent = (messageFlags & DOUBAO_REALTIME_EVENT_FLAG) !== 0

  let optionalSize = 0
  if (options.messageType === DoubaoRealtimeMessageType.ErrorInformation)
    optionalSize += 4
  if (hasSequenceField(messageFlags))
    optionalSize += 4
  if (hasEvent)
    optionalSize += 4
  if (connectId.byteLength > 0)
    optionalSize += 4 + connectId.byteLength
  if (sessionId.byteLength > 0)
    optionalSize += 4 + sessionId.byteLength

  const totalSize = 4 + optionalSize + 4 + payload.byteLength
  const bytes = new Uint8Array(totalSize)
  bytes[0] = (DOUBAO_REALTIME_PROTOCOL_VERSION << 4) | DOUBAO_REALTIME_HEADER_SIZE_WORDS
  bytes[1] = ((options.messageType & 0x0F) << 4) | (messageFlags & 0x0F)
  bytes[2] = (((options.serialization ?? DoubaoRealtimeSerializationMethod.Raw) & 0x0F) << 4) | ((options.compression ?? DoubaoRealtimeCompressionMethod.None) & 0x0F)
  bytes[3] = 0

  let offset = 4
  if (options.messageType === DoubaoRealtimeMessageType.ErrorInformation) {
    writeInt32(bytes, offset, options.errorCode ?? 0)
    offset += 4
  }
  if (hasSequenceField(messageFlags)) {
    writeInt32(bytes, offset, options.sequence ?? 0)
    offset += 4
  }
  if (hasEvent) {
    writeInt32(bytes, offset, options.event ?? 0)
    offset += 4
  }
  if (connectId.byteLength > 0) {
    writeInt32(bytes, offset, connectId.byteLength)
    offset += 4
    bytes.set(connectId, offset)
    offset += connectId.byteLength
  }
  if (sessionId.byteLength > 0) {
    writeInt32(bytes, offset, sessionId.byteLength)
    offset += 4
    bytes.set(sessionId, offset)
    offset += sessionId.byteLength
  }

  writeInt32(bytes, offset, payload.byteLength)
  offset += 4
  bytes.set(payload, offset)
  return bytes
}

export function parseDoubaoRealtimeFrame(input: ArrayBuffer | Uint8Array): ParsedDoubaoRealtimeFrame {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (bytes.byteLength < 8)
    throw new Error('Doubao realtime frame is too short.')

  const protocolVersion = (bytes[0] >> 4) & 0x0F
  const headerSizeWords = bytes[0] & 0x0F
  const messageType = (bytes[1] >> 4) & 0x0F
  const messageFlags = bytes[1] & 0x0F
  const serialization = (bytes[2] >> 4) & 0x0F
  const compression = bytes[2] & 0x0F
  const hasEvent = (messageFlags & DOUBAO_REALTIME_EVENT_FLAG) !== 0

  let offset = headerSizeWords * 4
  let errorCode: number | undefined
  let sequence: number | undefined
  let event: number | undefined
  let connectId: string | undefined
  let sessionId: string | undefined

  if (messageType === DoubaoRealtimeMessageType.ErrorInformation) {
    errorCode = readInt32(bytes, offset)
    offset += 4
  }
  if (hasSequenceField(messageFlags)) {
    sequence = readInt32(bytes, offset)
    offset += 4
  }
  if (hasEvent) {
    event = readInt32(bytes, offset)
    offset += 4
  }

  if (event != null && DOUBAO_REALTIME_CONNECT_EVENT_IDS.has(event)) {
    const connectIdSize = readInt32(bytes, offset)
    if (connectIdSize > 0) {
      offset += 4
      connectId = textDecoder.decode(bytes.subarray(offset, offset + connectIdSize))
      offset += connectIdSize
    }
  }

  if (event != null && DOUBAO_REALTIME_SESSION_EVENT_IDS.has(event)) {
    const sessionIdSize = readInt32(bytes, offset)
    if (sessionIdSize > 0) {
      offset += 4
      sessionId = textDecoder.decode(bytes.subarray(offset, offset + sessionIdSize))
      offset += sessionIdSize
    }
  }

  const payloadSize = readInt32(bytes, offset)
  offset += 4
  const payload = bytes.subarray(offset, offset + payloadSize)

  return {
    protocolVersion,
    headerSizeWords,
    messageType,
    messageFlags,
    serialization,
    compression,
    errorCode,
    sequence,
    event,
    connectId,
    sessionId,
    payloadSize,
    payload,
  }
}

export function decodeDoubaoRealtimeTextPayload(payload: Uint8Array) {
  return textDecoder.decode(payload)
}

export const DOUBAO_REALTIME_CONNECT_EVENT_IDS = new Set<number>([
  1,
  2,
  50,
  51,
  52,
])

export const DOUBAO_REALTIME_SESSION_EVENT_IDS = new Set<number>([
  100,
  102,
  150,
  152,
  153,
  154,
  200,
  201,
  251,
  300,
  350,
  351,
  352,
  359,
  400,
  450,
  451,
  459,
  500,
  501,
  502,
  510,
  511,
  512,
  513,
  514,
  515,
  550,
  553,
  559,
  567,
  568,
  569,
  570,
  571,
  599,
])
