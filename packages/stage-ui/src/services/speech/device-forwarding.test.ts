import type { SpeechDeliverySource } from './delivery'
import type { SpeechDeviceSender } from './device-forwarding'

import { describe, expect, it, vi } from 'vitest'

import { createSpeechDeviceForwarder, sniffAudioMimeType } from './device-forwarding'

function fakePipeline() {
  const listeners = new Map<string, (payload: unknown) => void>()
  const pipeline: SpeechDeliverySource = {
    on: (event, listener) => {
      listeners.set(event, listener as (payload: unknown) => void)
      return () => listeners.delete(event)
    },
  }
  const emit = (event: string, payload: unknown) => listeners.get(event)?.(payload)
  const item = (turnId: string, segmentId: string) => ({ item: { id: segmentId, turnId, streamId: 's', intentId: 'i', segmentId, sequence: 0, priority: 0, text: `${segmentId} text`, special: null } })
  return { pipeline, emit, item }
}

const device = { binding: 'discord:channel:voice-a', connectionId: 'discord-connection' }
const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x04]).buffer

describe('speech device forwarding', () => {
  it('sends captured segments to the device in playback order', () => {
    const { pipeline, emit, item } = fakePipeline()
    const send = vi.fn<SpeechDeviceSender>()
    const forwarder = createSpeechDeviceForwarder(send)
    forwarder.attach(pipeline)
    forwarder.startTurn('turn', device)

    forwarder.capture('turn', 'second', mp3)
    forwarder.capture('turn', 'first', mp3)
    forwarder.capture('local-turn', 'other', mp3)
    emit('onPlaybackStart', item('turn', 'first'))
    emit('onPlaybackStart', item('turn', 'second'))
    emit('onPlaybackStart', item('local-turn', 'other'))

    expect(send.mock.calls.map(([connectionId, event]) => [connectionId, event.type, event.type === 'speech:audio' ? event.data.segmentId : undefined])).toEqual([
      ['discord-connection', 'speech:audio', 'first'],
      ['discord-connection', 'speech:audio', 'second'],
    ])
    expect(send.mock.calls[0]?.[1].data).toMatchObject({ binding: device.binding, mimeType: 'audio/mpeg', audioBase64: 'SUQzBA==', text: 'first text' })
  })

  it('stops the device when local playback is interrupted, and forgets the turn', () => {
    const { pipeline, emit, item } = fakePipeline()
    const send = vi.fn<SpeechDeviceSender>()
    const forwarder = createSpeechDeviceForwarder(send)
    forwarder.attach(pipeline)
    forwarder.startTurn('turn', device)
    forwarder.capture('turn', 'late', mp3)

    emit('onPlaybackInterrupt', item('turn', 'current'))
    emit('onTurnCancel', { turnId: 'turn' })
    emit('onPlaybackStart', item('turn', 'late'))

    expect(send.mock.calls.map(([, event]) => event)).toEqual([{ type: 'speech:stop', data: { binding: device.binding, turnId: 'turn', reason: 'interrupted' } }])
  })

  it('recognizes common audio formats', () => {
    expect(sniffAudioMimeType(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe('audio/wav')
    expect(sniffAudioMimeType(new Uint8Array([0x4F, 0x67, 0x67, 0x53]))).toBe('audio/ogg')
    expect(sniffAudioMimeType(new Uint8Array([0xFF, 0xFB, 0x90, 0x00]))).toBe('audio/mpeg')
    expect(sniffAudioMimeType(new Uint8Array([0, 1, 2, 3]))).toBe('application/octet-stream')
  })
})
