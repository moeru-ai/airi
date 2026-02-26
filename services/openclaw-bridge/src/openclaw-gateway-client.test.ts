import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { decodeWebSocketMessage } from './openclaw-gateway-client.js'

describe('decodeWebSocketMessage', () => {
  const json = '{"type":"res","id":"a","ok":true}'

  it('decodes Buffer as UTF-8 string', () => {
    const raw = Buffer.from(json, 'utf8')
    expect(decodeWebSocketMessage(raw)).toBe(json)
  })

  it('decodes Buffer[] as UTF-8 string', () => {
    const chunk1 = '{"type":"res","id":"'
    const chunk2 = 'a","ok":true}'
    const raw = [Buffer.from(chunk1, 'utf8'), Buffer.from(chunk2, 'utf8')]
    expect(decodeWebSocketMessage(raw)).toBe(json)
  })

  it('decodes ArrayBuffer as UTF-8 string (critical: not comma-separated bytes)', () => {
    const raw = new TextEncoder().encode(json).buffer
    const decoded = decodeWebSocketMessage(raw)
    expect(decoded).toBe(json)
    const parsed = JSON.parse(decoded) as { type: string, id: string, ok: boolean }
    expect(parsed.type).toBe('res')
    expect(parsed.id).toBe('a')
    expect(parsed.ok).toBe(true)
  })
})
