import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { readJSONMessage } from './doubao-realtime-asr-proxy'

describe('doubao realtime asr proxy', () => {
  it('returns null instead of throwing on malformed control frames', () => {
    expect(readJSONMessage('{"type":"start"')).toBeNull()
    expect(readJSONMessage(Buffer.from('{"type":"start"'))).toBeNull()
  })
})
