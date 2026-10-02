import type { PcmBlock } from '@proj-airi/pipelines-audio'

import { AudioInput, capture, createPushStream, Playback } from '@proj-airi/pipelines-audio'
import { expect, it } from 'vitest'

import { BrowserPlayback, mediaStreamSource, microphoneSource, toMediaStream } from './browser'
import { encodeWav, toWav } from './encoding'

it('fails native output and releases its tracks when the audio context closes', async () => {
  const context = new AudioContext()
  await context.resume()
  const frames = createPushStream<PcmBlock>()
  const output = toMediaStream(frames.stream, context)
  const failed = output.done.then(() => false, () => true)
  await context.close()

  await expect.poll(() => output.media.getAudioTracks()[0].readyState).toBe('ended')
  expect(await failed).toBe(true)
})

it('keeps microphone tracks alive until the last subscriber leaves', async () => {
  const microphone = microphoneSource({ audio: true })
  const input = new AudioInput(microphone)
  const first = new AbortController()
  const second = new AbortController()
  const firstReader = input.subscribe({ signal: first.signal }).getReader()
  input.subscribe({ signal: second.signal })
  await firstReader.read()
  const track = microphone.stream!.getAudioTracks()[0]

  first.abort()
  expect(track.readyState).toBe('live')
  second.abort()

  await expect.poll(() => track.readyState).toBe('ended')
  expect(microphone.stream).toBeUndefined()
})

it('stops a late permission result when the only subscriber already left', async () => {
  const microphone = microphoneSource({ audio: true })
  const subscription = new AbortController()
  const input = new AudioInput(microphone)
  input.subscribe({ signal: subscription.signal })
  subscription.abort()

  await new Promise(resolve => setTimeout(resolve, 100))
  expect(microphone.stream).toBeUndefined()
})

it('fades real playback on the audio clock before confirming silence', async () => {
  const context = new AudioContext()
  await context.resume()
  const playback = new Playback(new BrowserPlayback(context))
  const group = playback.openGroup('voice')
  const clip = group.enqueue({ id: 'tone', audio: new Blob([toWav(new Float32Array(48000).fill(0.1).buffer, 48000)]) })
  await new Promise<void>(resolve => setTimeout(resolve, 100))
  const stoppedAt = context.currentTime
  const result = await group.stop({ fadeMs: 50 })

  expect(result.status).toBe('silent')
  expect(context.currentTime).toBeGreaterThanOrEqual(stoppedAt + 0.045)
  expect(result.played[0].throughMs).toBeGreaterThan(0)
  expect(await clip).toBe('stopped')
  await context.close()
})

it('records real Web Audio into WAV without stopping borrowed tracks', async () => {
  const context = new AudioContext()
  await context.resume()
  const oscillator = context.createOscillator()
  const destination = context.createMediaStreamDestination()
  oscillator.connect(destination)
  oscillator.start()
  const input = new AudioInput(mediaStreamSource(destination.stream, context))
  const recording = capture(input)
  const wav = encodeWav(recording.stream, { sampleRate: 16000, channels: 1 })
  await recording.started
  await new Promise(resolve => setTimeout(resolve, 100))

  expect((await recording.finish()).status).toBe('finished')
  const decoded = await new OfflineAudioContext(1, 1, 16000).decodeAudioData(await (await wav).arrayBuffer())
  expect(decoded.numberOfChannels).toBe(1)
  expect(decoded.length).toBeGreaterThan(0)
  expect(destination.stream.getAudioTracks()[0].readyState).toBe('live')
  oscillator.stop()
  destination.stream.getTracks().forEach(track => track.stop())
  await context.close()
})
