import { Buffer } from 'node:buffer'

/**
 * Normalizes websocket text payload chunks.
 *
 * Before:
 * - `Buffer.from("frame")`
 * - `[Buffer.from("a"), Buffer.from("b")]`
 *
 * After:
 * - `"frame"`
 * - `"ab"`
 */
export function bufferToString(data: Buffer | Buffer[] | ArrayBuffer): string {
  if (Array.isArray(data))
    return Buffer.concat(data).toString('utf8')
  if (data instanceof ArrayBuffer)
    return Buffer.from(data).toString('utf8')
  return data.toString('utf8')
}

/**
 * Normalizes websocket binary payload chunks.
 *
 * Before:
 * - `Buffer.from("audio")`
 * - `[Buffer.from("a"), Buffer.from("b")]`
 *
 * After:
 * - `ArrayBuffer`
 */
export function toBufferLike(data: Buffer | Buffer[] | ArrayBuffer): ArrayBuffer {
  if (Array.isArray(data)) {
    const merged = Buffer.concat(data)
    return merged.buffer.slice(merged.byteOffset, merged.byteOffset + merged.byteLength) as ArrayBuffer
  }
  if (data instanceof ArrayBuffer)
    return data
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
}

/**
 * Reads authoritative TTS usage characters from an upstream control payload.
 *
 * Before:
 * - `{ usage: { text_words: 42 } }`
 * - `{}`
 *
 * After:
 * - `42`
 * - `null`
 */
export function readUsageChars(payload: Record<string, unknown> | undefined): number | null {
  if (!payload || typeof payload !== 'object')
    return null
  const usage = (payload as { usage?: unknown }).usage
  if (!usage || typeof usage !== 'object')
    return null
  const textWords = (usage as { text_words?: unknown }).text_words
  if (typeof textWords === 'number' && Number.isFinite(textWords) && textWords >= 0)
    return Math.floor(textWords)
  return null
}
