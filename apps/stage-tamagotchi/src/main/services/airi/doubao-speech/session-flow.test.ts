import type { DoubaoSpeechRequest, DoubaoSpeechSessionConfig } from '@proj-airi/stage-shared/doubao-speech'

import { describe, expect, it } from 'vitest'

import { DoubaoSpeechEvent, DoubaoSpeechMessageType } from './protocol'
import { runDoubaoSpeechSession } from './session'

const config: DoubaoSpeechSessionConfig = {
  apiKey: 'test-key',
  baseUrl: 'wss://openspeech.bytedance.com/api/v3/tts/bidirection',
  resourceId: 'seed-tts-2.0',
  speaker: 'zh_female_test',
  audio: {
    format: 'mp3',
    sampleRate: 24000,
    speechRate: 0,
    loudnessRate: 0,
    pitch: 0,
  },
}

function writeInt32(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer, target.byteOffset + offset, 4).setInt32(0, value)
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer, target.byteOffset + offset, 4).setUint32(0, value)
}

function serverEvent(event: number, payload: Uint8Array, messageType: number = DoubaoSpeechMessageType.FullServerResponse) {
  const connectionEvent = event === DoubaoSpeechEvent.ConnectionStarted || event === DoubaoSpeechEvent.ConnectionFinished
  const identity = new TextEncoder().encode(connectionEvent ? 'connection-1' : '')
  const output = new Uint8Array(4 + 4 + 4 + identity.byteLength + 4 + payload.byteLength)
  output.set([0x11, (messageType << 4) | 0x04, messageType === DoubaoSpeechMessageType.AudioOnlyServer ? 0 : 0x10, 0])
  writeInt32(output, 4, event)
  writeUint32(output, 8, identity.byteLength)
  output.set(identity, 12)
  writeUint32(output, 12 + identity.byteLength, payload.byteLength)
  output.set(payload, 16 + identity.byteLength)
  return output
}

function clientEvent(frame: Uint8Array) {
  return new DataView(frame.buffer, frame.byteOffset + 4, 4).getInt32(0)
}

async function* requestStream(): AsyncGenerator<DoubaoSpeechRequest> {
  yield { type: 'start', config }
  yield { type: 'text', text: '你好' }
  yield { type: 'finish' }
}

describe('doubao speech session flow', () => {
  it('runs one connection from start through the final handshake', async () => {
    const sent: Uint8Array[] = []
    let resolveFinishedInput: () => void = () => {}
    const finishedInput = new Promise<void>((resolve) => {
      resolveFinishedInput = resolve
    })
    const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))

    async function* incoming() {
      yield serverEvent(DoubaoSpeechEvent.ConnectionStarted, json({}))
      yield serverEvent(DoubaoSpeechEvent.SessionStarted, json({}))
      await finishedInput
      yield serverEvent(DoubaoSpeechEvent.TTSResponse, Uint8Array.from([1, 2, 3]), DoubaoSpeechMessageType.AudioOnlyServer)
      yield serverEvent(DoubaoSpeechEvent.SessionFinished, json({ usage: { characters: 2 } }))
      yield serverEvent(DoubaoSpeechEvent.ConnectionFinished, json({}))
    }

    const responses = []
    for await (const response of runDoubaoSpeechSession(requestStream(), async () => ({
      incoming: incoming(),
      close() {},
      send(frame) {
        sent.push(frame)
        if (clientEvent(frame) === DoubaoSpeechEvent.FinishSession)
          resolveFinishedInput()
      },
    }))) {
      responses.push(response)
    }

    expect(sent.map(clientEvent)).toEqual([
      DoubaoSpeechEvent.StartConnection,
      DoubaoSpeechEvent.StartSession,
      DoubaoSpeechEvent.TaskRequest,
      DoubaoSpeechEvent.FinishSession,
      DoubaoSpeechEvent.FinishConnection,
    ])
    expect(responses).toEqual([
      { type: 'control', event: 'session.started' },
      { type: 'audio', data: Uint8Array.from([1, 2, 3]) },
      { type: 'control', event: 'session.finished', payload: { usage: { characters: 2 } } },
    ])
  })
})
