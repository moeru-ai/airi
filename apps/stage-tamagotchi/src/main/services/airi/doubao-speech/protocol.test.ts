import { describe, expect, it } from 'vitest'

import {
  decodeDoubaoSpeechMessage,
  DoubaoSpeechEvent,
  DoubaoSpeechMessageType,
  encodeDoubaoSpeechClientEvent,
} from './protocol'

function bytesFromHex(hex: string) {
  return Uint8Array.from(hex.match(/.{2}/g)?.map(value => Number.parseInt(value, 16)) ?? [])
}

describe('doubao speech binary protocol', () => {
  it('encodes StartConnection with the v1 JSON event frame', () => {
    const encoded = encodeDoubaoSpeechClientEvent({
      event: DoubaoSpeechEvent.StartConnection,
      payload: new TextEncoder().encode('{}'),
    })

    expect(encoded).toEqual(bytesFromHex('1114100000000001000000027b7d'))
  })

  it('encodes the session id before a StartSession payload', () => {
    const encoded = encodeDoubaoSpeechClientEvent({
      event: DoubaoSpeechEvent.StartSession,
      sessionId: 'session-1',
      payload: new TextEncoder().encode('{}'),
    })

    expect(encoded).toEqual(bytesFromHex(
      '11141000'
      + '00000064'
      + '0000000973657373696f6e2d31'
      + '000000027b7d',
    ))
  })

  it('decodes an audio response with its event and session id', () => {
    const encoded = bytesFromHex(
      '11b40000'
      + '00000160'
      + '0000000973657373696f6e2d31'
      + '00000003010203',
    )

    expect(decodeDoubaoSpeechMessage(encoded)).toEqual({
      compression: 0,
      connectId: undefined,
      errorCode: undefined,
      event: DoubaoSpeechEvent.TTSResponse,
      messageType: DoubaoSpeechMessageType.AudioOnlyServer,
      payload: bytesFromHex('010203'),
      sequence: undefined,
      serialization: 0,
      sessionId: 'session-1',
    })
  })

  it('decodes the connection id from ConnectionStarted', () => {
    const encoded = bytesFromHex(
      '11941000'
      + '00000032'
      + '00000009636f6e6e6563742d31'
      + '000000027b7d',
    )

    expect(decodeDoubaoSpeechMessage(encoded)).toMatchObject({
      connectId: 'connect-1',
      event: DoubaoSpeechEvent.ConnectionStarted,
      messageType: DoubaoSpeechMessageType.FullServerResponse,
      payload: bytesFromHex('7b7d'),
      sessionId: undefined,
    })
  })

  it('rejects a payload length that exceeds the frame', () => {
    const encoded = bytesFromHex(
      '11941000'
      + '00000032'
      + '00000009636f6e6e6563742d31'
      + '000000047b7d',
    )

    expect(() => decodeDoubaoSpeechMessage(encoded)).toThrow('payload')
  })
})
