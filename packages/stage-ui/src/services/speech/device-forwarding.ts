import type { SpeechAudioEvent, SpeechStopEvent } from '@proj-airi/server-sdk'

import type { SpeechDeliverySource } from './delivery'

import { encodeBase64 } from '@moeru/std/base64'

/** A device that receives one turn's speech. */
export interface ForwardedDevice {
  binding: string
  connectionId: string
}

/** Sends one speech event to a device connection. */
export type SpeechDeviceSender = (connectionId: string, event: { type: 'speech:audio', data: SpeechAudioEvent } | { type: 'speech:stop', data: SpeechStopEvent }) => void

/** Recognizes common encoded audio formats from their first bytes. */
export function sniffAudioMimeType(bytes: Uint8Array) {
  const ascii = String.fromCharCode(...bytes.subarray(0, 4))
  if (ascii === 'RIFF')
    return 'audio/wav'
  if (ascii === 'OggS')
    return 'audio/ogg'
  if (ascii.startsWith('ID3') || (bytes[0] === 0xFF && ((bytes[1] ?? 0) & 0xE0) === 0xE0))
    return 'audio/mpeg'
  return 'application/octet-stream'
}

/**
 * Forwards the voice to a speech device in playback order, and stops the device when local playback stops.
 *
 * Use when:
 * - A run's envelope names a speech device, so the same speech must reach that device.
 *
 * Expects:
 * - `attach` binds the speech pipeline once. The pipeline's synthesis can call `capture` before that, because it needs the forwarder first.
 * - `startTurn` runs before the turn's first segment is synthesized. `capture` receives encoded bytes before decoding.
 *
 * Returns:
 * - Turn and capture functions, and `attach`, which returns the stop function for the pipeline listeners.
 */
export function createSpeechDeviceForwarder(send: SpeechDeviceSender) {
  const turns = new Map<string, ForwardedDevice>()
  const audio = new Map<string, Uint8Array>()

  function keyOf(turnId: string, segmentId: string) {
    return `${turnId}\u0000${segmentId}`
  }

  function endTurn(turnId: string) {
    turns.delete(turnId)
    for (const key of audio.keys()) {
      if (key.startsWith(`${turnId}\u0000`))
        audio.delete(key)
    }
  }

  function stopTurn(turnId: string, reason: string) {
    const device = turns.get(turnId)
    if (!device)
      return
    send(device.connectionId, { type: 'speech:stop', data: { binding: device.binding, turnId, reason } })
    endTurn(turnId)
  }

  function attach(pipeline: SpeechDeliverySource) {
    const stops = [
      pipeline.on('onPlaybackStart', ({ item }) => {
        const device = item.turnId ? turns.get(item.turnId) : undefined
        const bytes = item.turnId ? audio.get(keyOf(item.turnId, item.segmentId)) : undefined
        if (!device || !bytes || !item.turnId)
          return
        audio.delete(keyOf(item.turnId, item.segmentId))
        send(device.connectionId, {
          type: 'speech:audio',
          data: { binding: device.binding, turnId: item.turnId, segmentId: item.segmentId, audioBase64: encodeBase64(bytes), mimeType: sniffAudioMimeType(bytes), text: item.text },
        })
      }),
      pipeline.on('onPlaybackInterrupt', ({ item }) => {
        if (item.turnId)
          stopTurn(item.turnId, 'interrupted')
      }),
      pipeline.on('onTurnCancel', ({ turnId }) => stopTurn(turnId, 'cancelled')),
      pipeline.on('onTurnEnd', turnId => endTurn(turnId)),
    ]
    return () => {
      for (const stop of stops)
        stop()
      turns.clear()
      audio.clear()
    }
  }

  return {
    attach,
    /** Starts forwarding one turn to a device. */
    startTurn(turnId: string, device: ForwardedDevice) {
      turns.set(turnId, device)
    },
    /** Keeps the encoded bytes of one segment until its playback starts. Turns without a device keep nothing. */
    capture(turnId: string | undefined, segmentId: string, bytes: ArrayBuffer) {
      if (turnId && turns.has(turnId))
        audio.set(keyOf(turnId, segmentId), new Uint8Array(bytes.slice(0)))
    },
  }
}
