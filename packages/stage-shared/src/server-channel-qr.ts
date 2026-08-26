import type { InferInput, InferOutput } from 'valibot'

import { array, check, literal, minLength, object, parse, pipe, string, transform } from 'valibot'

export const SERVER_CHANNEL_QR_PAYLOAD_TYPE = 'airi:server-channel'
export const SERVER_CHANNEL_QR_PAYLOAD_VERSION = 1

function isWebSocketUrl(value: string) {
  try {
    const url = new URL(value)
    return (url.protocol === 'ws:' || url.protocol === 'wss:') && !!url.hostname
  }
  catch {
    return false
  }
}

function normalizeWebSocketUrl(value: string) {
  return new URL(value).toString()
}

export const ServerChannelQrUrlSchema = pipe(
  string(),
  check(isWebSocketUrl, 'Expected a ws or wss URL.'),
  transform(normalizeWebSocketUrl),
)

export const ServerChannelQrPayloadSchema = object({
  authToken: string(),
  type: literal(SERVER_CHANNEL_QR_PAYLOAD_TYPE),
  urls: pipe(array(ServerChannelQrUrlSchema), minLength(1)),
  version: literal(SERVER_CHANNEL_QR_PAYLOAD_VERSION),
})

export type ServerChannelQrPayload = InferOutput<typeof ServerChannelQrPayloadSchema>
export type ServerChannelQrPayloadInput = InferInput<typeof ServerChannelQrPayloadSchema>

export function createServerChannelQrPayload(payload: ServerChannelQrPayloadInput) {
  return parse(ServerChannelQrPayloadSchema, payload)
}

export function parseServerChannelQrPayload(raw: string) {
  return parse(ServerChannelQrPayloadSchema, JSON.parse(raw))
}
