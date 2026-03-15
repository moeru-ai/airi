import type { VolcFrame } from './types'

import { Buffer } from 'node:buffer'

/**
 * Message types for the Volcengine realtime dialogue protocol.
 * Byte 1 left nibble (4 bits).
 */
export const MessageType = {
  /** Client sends text/JSON event */
  FULL_CLIENT_REQUEST: 0x01,
  /** Client sends audio binary data */
  AUDIO_ONLY_CLIENT: 0x02,
  /** Server returns text/JSON event */
  FULL_SERVER_RESPONSE: 0x09,
  /** Server returns audio binary data */
  AUDIO_ONLY_SERVER: 0x0B,
  /** Server returns error */
  ERROR: 0x0F,
} as const

/**
 * Message type specific flags.
 * Byte 1 right nibble (4 bits).
 */
export const Flags = {
  NONE: 0x00,
  HAS_SEQUENCE: 0x01,
  LAST_NO_SEQUENCE: 0x02,
  LAST_WITH_SEQUENCE: 0x03,
  HAS_EVENT: 0x04,
} as const

/**
 * Serialization methods.
 */
export const Serialization = {
  NONE: 0x00,
  JSON: 0x01,
} as const

/**
 * Compression methods.
 */
export const Compression = {
  NONE: 0x00,
  GZIP: 0x01,
} as const

const PROTOCOL_VERSION = 0x01
const HEADER_SIZE = 0x01 // Always 1 (= 4 bytes)

/**
 * Connect-level event IDs (no session_id).
 */
const CONNECT_EVENTS = new Set([1, 2, 50, 51, 52])

function isConnectEvent(eventId: number): boolean {
  return CONNECT_EVENTS.has(eventId)
}

/**
 * Encode a binary frame for the Volcengine realtime dialogue protocol.
 *
 * Binary layout:
 *   header(4B):
 *     byte 0: protocol_version(4bit) | header_size(4bit)
 *     byte 1: message_type(4bit) | flags(4bit)
 *     byte 2: serialization(4bit) | compression(4bit)
 *     byte 3: reserved (0x00)
 *   optional fields (based on flags and event type):
 *     [sequence(4B)]
 *     [event_id(4B)]             -- if flags & 0x04
 *     [session_id_size(4B) + session_id]  -- if session-level event
 *   payload:
 *     payload_size(4B) + payload
 */
export function encodeFrame(
  eventId: number,
  payload?: Buffer | Uint8Array,
  opts?: {
    messageType?: number
    sequence?: number
    sessionId?: string
  },
): Buffer {
  const msgType = opts?.messageType ?? MessageType.FULL_CLIENT_REQUEST
  const isAudio = msgType === MessageType.AUDIO_ONLY_CLIENT

  const parts: Buffer[] = []

  if (isAudio) {
    // Audio-only frames: header + event_id + payload
    // Include event_id (required by Volcengine) but skip session_id
    let flags = Flags.HAS_EVENT
    if (opts?.sequence != null) {
      flags |= Flags.HAS_SEQUENCE
    }

    const header = Buffer.alloc(4)
    header[0] = (PROTOCOL_VERSION << 4) | (HEADER_SIZE & 0x0F)
    header[1] = (msgType << 4) | (flags & 0x0F)
    header[2] = (Serialization.NONE << 4) | Compression.NONE
    header[3] = 0x00
    parts.push(header)

    if (opts?.sequence != null) {
      const buf = Buffer.alloc(4)
      buf.writeUInt32BE(opts.sequence, 0)
      parts.push(buf)
    }

    // Event ID (required)
    const eventBuf = Buffer.alloc(4)
    eventBuf.writeUInt32BE(eventId, 0)
    parts.push(eventBuf)

    // Session ID for audio frames
    if (opts?.sessionId) {
      const sidBuf = Buffer.from(opts.sessionId, 'utf-8')
      const sidSizeBuf = Buffer.alloc(4)
      sidSizeBuf.writeUInt32BE(sidBuf.length, 0)
      parts.push(sidSizeBuf)
      parts.push(sidBuf)
    }

    const payloadData = payload ? Buffer.from(payload) : Buffer.alloc(0)
    const pSizeBuf = Buffer.alloc(4)
    pSizeBuf.writeUInt32BE(payloadData.length, 0)
    parts.push(pSizeBuf)
    if (payloadData.length > 0) {
      parts.push(payloadData)
    }
  }
  else {
    // Full client request: header + [sequence] + event_id + [session_id] + payload
    let flags = Flags.HAS_EVENT
    if (opts?.sequence != null) {
      flags |= Flags.HAS_SEQUENCE
    }

    const header = Buffer.alloc(4)
    header[0] = (PROTOCOL_VERSION << 4) | (HEADER_SIZE & 0x0F)
    header[1] = (msgType << 4) | (flags & 0x0F)
    header[2] = (Serialization.JSON << 4) | Compression.NONE
    header[3] = 0x00
    parts.push(header)

    if (opts?.sequence != null) {
      const buf = Buffer.alloc(4)
      buf.writeUInt32BE(opts.sequence, 0)
      parts.push(buf)
    }

    // Event ID
    const eventBuf = Buffer.alloc(4)
    eventBuf.writeUInt32BE(eventId, 0)
    parts.push(eventBuf)

    // Session ID (for session-level events only)
    if (!isConnectEvent(eventId) && opts?.sessionId) {
      const sidBuf = Buffer.from(opts.sessionId, 'utf-8')
      const sidSizeBuf = Buffer.alloc(4)
      sidSizeBuf.writeUInt32BE(sidBuf.length, 0)
      parts.push(sidSizeBuf)
      parts.push(sidBuf)
    }

    const payloadData = payload ? Buffer.from(payload) : Buffer.alloc(0)
    const pSizeBuf = Buffer.alloc(4)
    pSizeBuf.writeUInt32BE(payloadData.length, 0)
    parts.push(pSizeBuf)
    if (payloadData.length > 0) {
      parts.push(payloadData)
    }
  }

  return Buffer.concat(parts)
}

/**
 * Decode a binary frame from the Volcengine realtime dialogue protocol.
 */
export function decodeFrame(data: Buffer): VolcFrame {
  let offset = 0

  // Header byte 0: version | header_size
  const _byte0 = data[offset++]

  // Header byte 1: message_type(4bit) | flags(4bit)
  const byte1 = data[offset++]
  const messageType = (byte1 >> 4) & 0x0F
  const flags = byte1 & 0x0F

  // Header byte 2: serialization | compression
  const _byte2 = data[offset++]

  // Header byte 3: reserved
  offset++

  let eventId = 0
  let sequence: number | undefined
  let sessionId: string | undefined

  // Error code (only for error message type 0x0F)
  if (messageType === MessageType.ERROR) {
    // 4 bytes error code
    offset += 4
  }

  // Sequence (if flags indicate sequence presence)
  if ((flags & 0x03) !== 0) {
    sequence = data.readUInt32BE(offset)
    offset += 4
  }

  // Event ID (if flags & 0x04)
  if (flags & Flags.HAS_EVENT) {
    eventId = data.readUInt32BE(offset)
    offset += 4
  }

  // Session ID or Connect ID (based on event type)
  // Session-level events carry session_id after event_id
  if (eventId > 0 && !isConnectEvent(eventId)) {
    if (offset + 4 <= data.length) {
      const sidSize = data.readUInt32BE(offset)
      offset += 4
      if (sidSize > 0 && offset + sidSize <= data.length) {
        sessionId = data.subarray(offset, offset + sidSize).toString('utf-8')
        offset += sidSize
      }
    }
  }
  else if (eventId > 0 && isConnectEvent(eventId)) {
    // Connect events may have connect_id - skip if present
    // For simplicity, check if there's enough data for a size field
    if (offset + 4 <= data.length) {
      const cidSize = data.readUInt32BE(offset)
      // Heuristic: if cidSize looks like a reasonable string length
      if (cidSize > 0 && cidSize < 256 && offset + 4 + cidSize <= data.length) {
        offset += 4
        offset += cidSize // skip connect_id bytes
      }
    }
  }

  // Payload size + payload
  let payload: Buffer<ArrayBuffer> | Uint8Array = Buffer.alloc(0)
  if (offset + 4 <= data.length) {
    const payloadSize = data.readUInt32BE(offset)
    offset += 4
    if (payloadSize > 0 && offset + payloadSize <= data.length) {
      payload = Uint8Array.prototype.slice.call(data, offset, offset + payloadSize) as Uint8Array
    }
    else if (payloadSize > 0) {
      // Take remaining data as payload
      payload = Uint8Array.prototype.slice.call(data, offset) as Uint8Array
    }
  }
  else if (offset < data.length) {
    // No payload size header but remaining data exists (possible for audio)
    payload = Uint8Array.prototype.slice.call(data, offset) as Uint8Array
  }

  return {
    eventId,
    sequence,
    sessionId,
    payload,
    messageType,
  }
}
