import type { PcmBlock } from '@proj-airi/pipelines-audio'

import { AudioInput, capture, observeLevel, Playback } from '@proj-airi/pipelines-audio'
import { createPushStream } from '@proj-airi/stream-kit'
import { expect, it, vi } from 'vitest'

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

// Each connection created an AudioContext and loaded the capture worklet again. While other pages used the CPU, the
// load took up to 1 s. The device was already open, so the audio of that time was lost.
it('loads the capture worklet once and resumes the idle context for a later connection', async () => {
  const addModule = vi.spyOn(AudioWorklet.prototype, 'addModule')
  const suspend = vi.spyOn(AudioContext.prototype, 'suspend')
  // These options are not used by other tests in this file, so this test owns the shared context.
  const microphone = microphoneSource({ audio: true }, { contextOptions: { sampleRate: 22050 } })
  const input = new AudioInput(microphone)

  for (const connection of [1, 2]) {
    const subscription = new AbortController()
    const reader = input.subscribe({ signal: subscription.signal }).getReader()
    expect((await reader.read()).done, `connection ${connection} receives audio`).toBe(false)
    subscription.abort()
    await expect.poll(() => microphone.stream).toBeUndefined()
    await expect.poll(() => suspend.mock.calls.length).toBe(connection)
  }

  expect(addModule).toHaveBeenCalledOnce()
  addModule.mockRestore()
  suspend.mockRestore()
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
  expect(result.played[0].interval!.endMs).toBeGreaterThanOrEqual(stoppedAt * 1000 + 45)
  expect(await clip).toBe('stopped')
  await context.close()
})

it('reports the level of what the playback plays through its output', async () => {
  const context = new AudioContext()
  await context.resume()
  const playback = new Playback(new BrowserPlayback(context))
  const abort = new AbortController()
  const levels: number[] = []
  const observer = observeLevel(playback.output!, abort.signal, level => levels.push(level))

  // Silence before the clip, then a tone at -20 dBFS, which is level 2/3.
  await expect.poll(() => levels.length).toBeGreaterThan(2)
  expect(Math.max(...levels)).toBe(0)
  const group = playback.openGroup('voice')
  void group.enqueue({ id: 'tone', audio: new Blob([toWav(new Float32Array(24000).fill(0.1).buffer, 48000)]) })
  await expect.poll(() => Math.max(...levels), { timeout: 2000 }).toBeCloseTo(2 / 3, 1)

  abort.abort()
  await observer.done
  await group.stop({ fadeMs: 10 })
  await context.close()
})

it('connects a graph node to the played audio until it disconnects', async () => {
  const context = new AudioContext()
  await context.resume()
  const playback = new Playback(new BrowserPlayback(context))
  const analyser = context.createAnalyser()
  const samples = new Float32Array(analyser.fftSize)
  const peak = () => {
    analyser.getFloatTimeDomainData(samples)
    return Math.max(...samples.map(Math.abs))
  }
  const disconnect = playback.connect!(analyser)

  const group = playback.openGroup('voice')
  void group.enqueue({ id: 'tone', audio: new Blob([toWav(new Float32Array(24000).fill(0.1).buffer, 48000)]) })
  await expect.poll(peak, { timeout: 2000 }).toBeCloseTo(0.1, 2)

  disconnect()
  await expect.poll(peak, { timeout: 2000 }).toBe(0)
  await group.stop({ fadeMs: 10 })
  await context.close()
})

it('starts a clip at a later time on the audio clock and reports its rendered interval', async () => {
  const context = new AudioContext()
  await context.resume()
  const playback = new Playback(new BrowserPlayback(context))
  const group = playback.openGroup('voice')
  const startAtMs = playback.nowMs() + 200
  // 4800 frames at 48 kHz is 100 ms of audio.
  void group.enqueue({ id: 'tone', audio: new Blob([toWav(new Float32Array(4800).fill(0.1).buffer, 48000)]), startAtMs })
  const receipt = await group.finish()
  const played = receipt.played[0]

  expect(receipt.status).toBe('silent')
  expect(played.interval!.startMs).toBeCloseTo(startAtMs, 0)
  expect(played.interval!.endMs - played.interval!.startMs).toBeCloseTo(100, 0)
  expect(played.throughMs).toBeCloseTo(100, 0)
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
