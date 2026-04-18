import { describe, expect, it } from 'vitest'

import {
  buildDoubaoRealtimeFrame,
  decodeDoubaoRealtimeTextPayload,
  DOUBAO_REALTIME_EVENT_FLAG,
  DoubaoRealtimeCompressionMethod,
  DoubaoRealtimeMessageType,
  DoubaoRealtimeSerializationMethod,
  parseDoubaoRealtimeFrame,
} from './doubao-realtime-protocol'

describe('doubao realtime protocol', () => {
  it('round-trips a StartSession frame with session id and JSON payload', () => {
    const frame = buildDoubaoRealtimeFrame({
      messageType: DoubaoRealtimeMessageType.FullClientRequest,
      messageFlags: DOUBAO_REALTIME_EVENT_FLAG,
      serialization: DoubaoRealtimeSerializationMethod.JSON,
      compression: DoubaoRealtimeCompressionMethod.None,
      event: 100,
      sessionId: '75a6126e-427f-49a1-a2c1-621143cb9db3',
      payload: JSON.stringify({
        asr: {
          audio_info: {
            format: 'pcm',
            sample_rate: 16000,
            channel: 1,
          },
          extra: {},
        },
        dialog: {
          extra: {
            input_mod: 'push_to_talk',
            model: '1.2.1.1',
          },
        },
      }),
    })

    const parsed = parseDoubaoRealtimeFrame(frame)

    expect(parsed.messageType).toBe(DoubaoRealtimeMessageType.FullClientRequest)
    expect(parsed.messageFlags).toBe(DOUBAO_REALTIME_EVENT_FLAG)
    expect(parsed.event).toBe(100)
    expect(parsed.sessionId).toBe('75a6126e-427f-49a1-a2c1-621143cb9db3')
    expect(JSON.parse(decodeDoubaoRealtimeTextPayload(parsed.payload))).toMatchObject({
      asr: {
        audio_info: {
          format: 'pcm',
          sample_rate: 16000,
          channel: 1,
        },
      },
      dialog: {
        extra: {
          input_mod: 'push_to_talk',
          model: '1.2.1.1',
        },
      },
    })
  })

  it('round-trips an audio TaskRequest frame with raw payload', () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6])
    const frame = buildDoubaoRealtimeFrame({
      messageType: DoubaoRealtimeMessageType.AudioOnlyRequest,
      messageFlags: DOUBAO_REALTIME_EVENT_FLAG,
      serialization: DoubaoRealtimeSerializationMethod.Raw,
      compression: DoubaoRealtimeCompressionMethod.None,
      event: 200,
      sessionId: 'session-id',
      payload,
    })

    const parsed = parseDoubaoRealtimeFrame(frame)
    expect(parsed.messageType).toBe(DoubaoRealtimeMessageType.AudioOnlyRequest)
    expect(parsed.event).toBe(200)
    expect(parsed.sessionId).toBe('session-id')
    expect(Array.from(parsed.payload)).toEqual(Array.from(payload))
  })
})
