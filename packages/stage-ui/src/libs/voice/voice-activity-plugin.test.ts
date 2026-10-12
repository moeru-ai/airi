import type { SpeechInputAttempt, TranscriptionEvent } from '@proj-airi/core-agent'
import type { PcmBlock } from '@proj-airi/pipelines-audio'

import { VoiceController } from '@proj-airi/core-agent'
import { AudioInput, createPushStream, Playback } from '@proj-airi/pipelines-audio'
import { expect, it, vi } from 'vitest'

import { listensContinuously, startsInputOnSpeech } from '../../stores/modules/hearing'
import { createVoiceActivityPlugin } from './voice-activity-plugin'

it('uses ordered VAD signals to capture, stream transcription, and submit to the accepted session', async () => {
  const source = createPushStream<PcmBlock>()
  const audio = new AudioInput({ live: true, open: () => source.stream }, { historyMs: 360 })
  const received: number[] = []
  const submit = vi.fn(async () => ({ status: 'committed' as const, messageId: 'accepted' }))
  let sessionId = 'alice'
  let attempt: SpeechInputAttempt | undefined
  const controller = new VoiceController({ audio, submit, transcriber: () => ({
    transcribe: (request) => {
      const media = request.audio
      return new ReadableStream<TranscriptionEvent>({ async start(output) {
        for await (const block of media)
          received.push(...block.channels[0])
        output.enqueue({ type: 'update', revision: 1, segments: [{ id: 'words', revision: 1, text: 'Hello', final: true, tokens: [] }] })
        output.enqueue({ type: 'complete', revision: 1 })
        output.close()
      } })
    },
  }) })
  controller.use(createVoiceActivityPlugin({
    detect: async window => window.channels[0][0],
    target: () => ({ sessionId, interruptTurns: [] }),
    onInput: () => { attempt = controller.activeInput },
    minSpeechMs: 32,
    silenceMs: 64,
  }), { grants: ['input-control', 'cancel-input'] })
  await Promise.resolve()
  source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 32 }, sampleRate: 1000, channels: [new Float32Array(32).fill(1)] })
  await expect.poll(() => attempt?.state.phase).toBe('capturing')
  sessionId = 'bob'
  source.write({ range: { sourceId: 'mic', startFrame: 32, endFrame: 96 }, sampleRate: 1000, channels: [new Float32Array(64)] })
  expect(await attempt!.done).toEqual({ status: 'committed', messageId: 'accepted' })
  expect(received).toHaveLength(96)
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'alice', text: 'Hello' }), expect.any(AbortSignal))
  await controller.close()
})

it('rejects playback echo and opens the matched character input only after playback fades', async () => {
  const frames = createPushStream<PcmBlock>()
  const audio = new AudioInput({ live: true, open: () => frames.stream })
  const fading = Promise.withResolvers<{ throughMs: number }>()
  const played = vi.fn()
  const fade = vi.fn(() => fading.promise)
  const playback = new Playback({ nowMs: () => 0, play: () => {
    played()
    return { done: new Promise<{ throughMs: number }>(() => {}), stop: fade }
  } })
  const received: number[] = []
  const submit = vi.fn(async () => ({ status: 'committed' as const, messageId: 'wake-message' }))
  const interrupted = vi.fn(async () => ({ status: 'queued' as const }))
  const controller = new VoiceController({ audio, submit, recordInterruption: interrupted, speech: () => ({ playback, synthesize: async () => new Blob(['Speaking']) }), transcriber: () => ({ transcribe(request) {
    const stream = request.audio
    return new ReadableStream<TranscriptionEvent>({ async start(output) {
      for await (const block of stream)
        received.push(...block.channels[0])
      output.enqueue({ type: 'update', revision: 1, segments: [{ id: 'text', revision: 1, text: 'Question', final: true, tokens: [] }] })
      output.enqueue({ type: 'complete', revision: 1 })
      output.close()
    } })
  } }) })
  const turn = { sessionId: 'alice', turnId: 'answer' }
  const response = controller.openResponse(turn)
  const speech = response.openSpeech({ purpose: 'answer' })
  await speech.write('Speaking.')
  speech.end()
  await expect.poll(() => played).toHaveBeenCalledOnce()
  let accepted = false
  const detected = vi.fn(async () => ({ sessionId: 'alice', interruptTurns: [turn] }))
  const gate = vi.fn(async () => accepted)
  controller.use(createVoiceActivityPlugin({
    detect: async window => window.channels[0][0],
    detectWakeWord: async window => window.range.startFrame < 96 ? detected() : undefined,
    acceptSpeech: gate,
    target: () => ({ sessionId: 'other', interruptTurns: [] }),
    minSpeechMs: 32,
    silenceMs: 32,
  }), { grants: ['input-control', 'cancel-input'] })
  await Promise.resolve()
  function push(startFrame: number, value: number) {
    frames.write({ range: { sourceId: 'mic', startFrame, endFrame: startFrame + 32 }, sampleRate: 1000, channels: [new Float32Array(32).fill(value)] })
  }
  push(0, 1)
  await expect.poll(() => gate).toHaveBeenCalledOnce()
  expect(controller.activeInput).toBeUndefined()
  expect(fade).not.toHaveBeenCalled()
  accepted = true
  push(32, 1)
  await expect.poll(() => fade).toHaveBeenCalledOnce()
  const attempt = controller.activeInput!
  expect(attempt.state).toEqual({ phase: 'pending', waitingFor: 'silence' })
  push(64, 1)
  await expect.poll(() => detected).toHaveBeenCalledTimes(3)
  fading.resolve({ throughMs: 100 })
  // After silence, the input subscribes and the next source block admits it.
  await expect.poll(() => attempt.state).toEqual({ phase: 'pending', waitingFor: 'source' })
  push(96, 1)
  await expect.poll(() => attempt.state.phase).toBe('capturing')
  await expect.poll(() => received.length).toBe(32)
  push(128, 0)
  expect(await attempt.done).toEqual({ status: 'committed', messageId: 'wake-message' })
  expect(received).toHaveLength(64)
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'alice', text: 'Question' }), expect.any(AbortSignal))
  await expect.poll(() => interrupted).toHaveBeenCalledOnce()
  await controller.close()
})

it('starts an input in wake word mode only after a wake word', async () => {
  const frames = createPushStream<PcmBlock>()
  const audio = new AudioInput({ live: true, open: () => frames.stream })
  const submit = vi.fn(async () => ({ status: 'committed' as const, messageId: 'wake-message' }))
  const controller = new VoiceController({ audio, submit, transcriber: () => ({ transcribe: request => new ReadableStream<TranscriptionEvent>({ async start(output) {
    // The test needs only the transcript, so the captured audio is drained and dropped.
    await request.audio.pipeTo(new WritableStream())
    output.enqueue({ type: 'update', revision: 1, segments: [{ id: 'text', revision: 1, text: 'Hello', final: true, tokens: [] }] })
    output.enqueue({ type: 'complete', revision: 1 })
    output.close()
  } }) }) })
  let wake = false
  const target = vi.fn(() => startsInputOnSpeech('wake-word') ? { sessionId: 'active', interruptTurns: [] } : undefined)
  controller.use(createVoiceActivityPlugin({
    detect: async window => window.channels[0][0],
    detectWakeWord: async () => wake ? { sessionId: 'alice', interruptTurns: [] } : undefined,
    target,
    minSpeechMs: 32,
    silenceMs: 64,
  }), { grants: ['input-control', 'cancel-input'] })
  await Promise.resolve()
  function push(startFrame: number, value: number) {
    frames.write({ range: { sourceId: 'mic', startFrame, endFrame: startFrame + 32 }, sampleRate: 1000, channels: [new Float32Array(32).fill(value)] })
  }

  // Speech without a wake word asks for a target, gets none, and starts no input.
  push(0, 1)
  push(32, 1)
  await expect.poll(() => target).toHaveBeenCalledTimes(2)
  expect(controller.activeInput).toBeUndefined()

  wake = true
  push(64, 1)
  await expect.poll(() => controller.activeInput?.sessionId).toBe('alice')
  expect(startsInputOnSpeech('always-on')).toBe(true)
  expect(startsInputOnSpeech('push-to-talk')).toBe(false)
  expect(listensContinuously('wake-word')).toBe(true)
  await controller.close()
})
