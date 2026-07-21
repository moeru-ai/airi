import type { RawData } from 'ws'

import { Buffer } from 'node:buffer'

import { finite, looseObject, minValue, number, optional, pipe, safeParse } from 'valibot'

const UpstreamUsagePayloadSchema = looseObject({
  usage: optional(looseObject({
    text_words: optional(pipe(
      number(),
      finite(),
      minValue(0),
    )),
  })),
})

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
export function bufferToString(data: RawData): string {
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
export function toBufferLike(data: RawData): ArrayBuffer {
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
  const result = safeParse(UpstreamUsagePayloadSchema, payload)
  const textWords = result.success ? result.output.usage?.text_words : undefined
  return typeof textWords === 'number' ? Math.floor(textWords) : null
}
