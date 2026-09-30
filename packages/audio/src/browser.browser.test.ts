import { AudioInput, createPushStream, Playback } from '@proj-airi/pipelines-audio'
import { expect, it } from 'vitest'

import { BrowserAudioSource, BrowserMediaAdapters, BrowserPlayback, Microphone } from './browser'
import { toWav } from './encoding'

it('fails native capture and releases its output when the audio context closes', async () => {
  const context = new AudioContext()
  await context.resume()
  const frames = createPushStream<import('@proj-airi/pipelines-audio').PcmBlock>()
  const output = new BrowserMediaAdapters(context).nativeStream(frames.stream, new AbortController().signal)
  const failed = output.done.then(() => false, () => true)
  await context.close()
  await expect.poll(() => output.media.getAudioTracks()[0].readyState).toBe('ended')
  expect(await failed).toBe(true)
})

it('shares microphone startup and releases owned tracks when the microphone closes', async () => {
  const microphone = new Microphone({ audio: true })
  const first = microphone.open()
  expect(microphone.open()).toBe(first)
  await first
  const track = microphone.stream!.getAudioTracks()[0]
  expect(track.readyState).toBe('live')
  await microphone.close()
  expect(track.readyState).toBe('ended')
  expect(microphone.stream).toBeUndefined()
})

it('keeps shared tracks alive until the last capture or monitor releases its lease', async () => {
  const microphone = new Microphone({ audio: true })
  const first = microphone.acquire()
  const second = microphone.acquire()
  expect(await first.input).toBe(await second.input)
  const track = microphone.stream!.getAudioTracks()[0]
  await first.release()
  await first.release()
  expect(track.readyState).toBe('live')
  await second.release()
  expect(track.readyState).toBe('ended')
})

it('releases a late permission result when the last pending lease is cancelled', async () => {
  const microphone = new Microphone({ audio: true })
  const lease = microphone.acquire()
  const rejected = expect(lease.input).rejects.toThrow()
  await lease.release()
  await rejected
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

it('records real Web Audio into PCM and WAV without stopping borrowed microphone tracks', async () => {
  const context = new AudioContext()
  await context.resume()
  const oscillator = context.createOscillator()
  const destination = context.createMediaStreamDestination()
  oscillator.connect(destination)
  oscillator.start()
  const source = await BrowserAudioSource.open(context, destination.stream)
  const input = new AudioInput(source, new BrowserMediaAdapters(context))
  const capture = input.capture({ delivery: 'pcm-and-file', file: { mimeType: 'audio/wav', sampleRate: 16000, channels: 1 } })
  const reader = capture.media.getReader()
  await expect.poll(async () => (await reader.read()).value?.channels[0].some(value => value !== 0)).toBe(true)
  const result = await capture.finish()
  expect(result.status).toBe('finished')
  if (result.status !== 'finished')
    throw new Error('Recording failed')
  const offline = new OfflineAudioContext(1, 1, 16000)
  const decoded = await offline.decodeAudioData(await result.value.arrayBuffer())
  expect(decoded.numberOfChannels).toBe(1)
  expect(decoded.length).toBeGreaterThan(0)
  await input.close()
  expect(destination.stream.getAudioTracks()[0].readyState).toBe('live')
  oscillator.stop()
  destination.stream.getTracks().forEach(track => track.stop())
  await context.close()
})
