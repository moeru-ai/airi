import type { PlaybackDriver, SpeechPipelineOptions, TtsRequest } from '@proj-airi/pipelines-audio'

import type { SpeechAudio, StreamingTranscriber, TranscriptionEvent } from '../../index'

import { AudioInput, createPushStream, Playback } from '@proj-airi/pipelines-audio'
import { APICallError } from '@xsai/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { VoiceController } from '../../index'
import { keepOpen, pcmSource } from '../../testing/audio'

function synthesisFailure(status: number, headers?: HeadersInit) {
  return new APICallError(`Remote sent ${status} response`, {
    response: new Response('unavailable', { status, headers }),
    responseBody: 'unavailable',
  })
}

function synthesisHarness(synthesize: SpeechPipelineOptions<Blob>['tts']) {
  const play = vi.fn<PlaybackDriver['play']>(() => ({
    done: Promise.resolve({ throughMs: 1 }),
    stop: async () => ({ throughMs: 0 }),
  }))
  const playback = new Playback({ nowMs: () => 0, play })
  const controller = new VoiceController({ speech: () => ({ playback, synthesize }) })
  const response = controller.openResponse({ sessionId: 'alice', turnId: 'retry' })
  const speech = response.openSpeech({ purpose: 'answer' })
  return { controller, response, speech, play }
}

describe('voiceController output', () => {
  describe('transient synthesis failures', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('retries a rejected segment before failing its producer', async () => {
      // ROOT CAUSE:
      // A provider rejection used to call SpeechStream.fail immediately, which
      // cancelled its intent before the segment could recover. Retry before
      // that terminal transition, using the same request and cancellation scope.
      const audio = new Blob(['Hello.'])
      const synthesize = vi.fn<SpeechPipelineOptions<Blob>['tts']>()
        .mockRejectedValueOnce(synthesisFailure(503))
        .mockResolvedValue(audio)
      const harness = synthesisHarness(synthesize)
      await harness.speech.write('Hello.')
      harness.speech.end()
      await vi.advanceTimersByTimeAsync(0)
      expect(synthesize).toHaveBeenCalledTimes(1)
      expect(harness.speech.signal.aborted).toBe(false)
      await vi.advanceTimersByTimeAsync(299)
      expect(synthesize).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(await harness.response.finish()).toBe('finished')
      expect(synthesize).toHaveBeenCalledTimes(2)
      expect(synthesize.mock.calls[1][0]).toBe(synthesize.mock.calls[0][0])
      expect(synthesize.mock.calls[1][1]).toBe(synthesize.mock.calls[0][1])
      expect(harness.play).toHaveBeenCalledTimes(1)
      expect(harness.play.mock.calls[0][0].audio).toBe(audio)
      await harness.controller.close()
    })

    it('fails after three attempts with the final provider error', async () => {
      const error = synthesisFailure(503)
      const synthesize = vi.fn<SpeechPipelineOptions<Blob>['tts']>()
        .mockRejectedValueOnce(synthesisFailure(502))
        .mockRejectedValueOnce(synthesisFailure(504))
        .mockRejectedValue(error)
      const harness = synthesisHarness(synthesize)
      await harness.speech.write('Hello.')
      harness.speech.end()
      await vi.advanceTimersByTimeAsync(300)
      expect(synthesize).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(599)
      expect(synthesize).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(1)
      expect(await harness.speech.done).toEqual({ status: 'failed', error })
      expect(harness.speech.signal.reason).toBe(error)
      expect(await harness.response.finish()).toBe('failed')
      expect(synthesize).toHaveBeenCalledTimes(3)
      expect(harness.play).not.toHaveBeenCalled()
      await harness.controller.close()
    })

    it('does not retry a permanent request failure', async () => {
      const synthesize = vi.fn<SpeechPipelineOptions<Blob>['tts']>().mockRejectedValue(synthesisFailure(401))
      const harness = synthesisHarness(synthesize)
      await harness.speech.write('Hello.')
      harness.speech.end()
      await vi.advanceTimersByTimeAsync(0)
      expect(await harness.response.finish()).toBe('failed')
      expect(synthesize).toHaveBeenCalledTimes(1)
      expect(harness.play).not.toHaveBeenCalled()
      await harness.controller.close()
    })

    it.each([408, 425, 429, 500, 502, 504])('recovers from HTTP %i before playback', async (status) => {
      const synthesize = vi.fn<SpeechPipelineOptions<Blob>['tts']>()
        .mockRejectedValueOnce(synthesisFailure(status))
        .mockResolvedValue(new Blob(['Hello.']))
      const harness = synthesisHarness(synthesize)
      await harness.speech.write('Hello.')
      harness.speech.end()
      await vi.advanceTimersByTimeAsync(300)
      expect(await harness.response.finish()).toBe('finished')
      expect(synthesize).toHaveBeenCalledTimes(2)
      expect(harness.play).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
      await harness.controller.close()
    })

    it('retries a fetch transport failure', async () => {
      const synthesize = vi.fn<SpeechPipelineOptions<Blob>['tts']>()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValue(new Blob(['Hello.']))
      const harness = synthesisHarness(synthesize)
      await harness.speech.write('Hello.')
      harness.speech.end()
      await vi.advanceTimersByTimeAsync(300)
      expect(await harness.response.finish()).toBe('finished')
      expect(synthesize).toHaveBeenCalledTimes(2)
      await harness.controller.close()
    })

    it.each([
      new TypeError('Cannot read properties of undefined'),
      new Error('Unknown model 503'),
      new DOMException('Request cancelled', 'AbortError'),
      synthesisFailure(400),
      synthesisFailure(404),
      synthesisFailure(501),
    ])('fails without retrying %s', async (error) => {
      const synthesize = vi.fn<SpeechPipelineOptions<Blob>['tts']>().mockRejectedValue(error)
      const harness = synthesisHarness(synthesize)
      await harness.speech.write('Hello.')
      harness.speech.end()
      await vi.advanceTimersByTimeAsync(0)
      expect(await harness.response.finish()).toBe('failed')
      expect(synthesize).toHaveBeenCalledTimes(1)
      expect(harness.play).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
      await harness.controller.close()
    })

    it.each([
      { header: '2', delayMs: 2_000 },
      { header: 'Thu, 01 Jan 2026 00:00:02 GMT', delayMs: 2_000 },
      { header: 'invalid', delayMs: 300 },
    ])('uses the provider wait for Retry-After: $header', async ({ header, delayMs }) => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      const synthesize = vi.fn<SpeechPipelineOptions<Blob>['tts']>()
        .mockRejectedValueOnce(synthesisFailure(429, { 'retry-after': header }))
        .mockResolvedValue(new Blob(['Hello.']))
      const harness = synthesisHarness(synthesize)
      await harness.speech.write('Hello.')
      harness.speech.end()
      await vi.advanceTimersByTimeAsync(delayMs - 1)
      expect(synthesize).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      expect(await harness.response.finish()).toBe('finished')
      expect(synthesize).toHaveBeenCalledTimes(2)
      await harness.controller.close()
    })

    it('fails instead of reserving playback for a provider wait above thirty seconds', async () => {
      const synthesize = vi.fn<SpeechPipelineOptions<Blob>['tts']>()
        .mockRejectedValue(synthesisFailure(429, { 'retry-after': '31' }))
      const harness = synthesisHarness(synthesize)
      await harness.speech.write('Hello.')
      harness.speech.end()
      await vi.advanceTimersByTimeAsync(0)
      expect(await harness.response.finish()).toBe('failed')
      expect(synthesize).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
      await harness.controller.close()
    })

    it('treats a null synthesis result as intentional silence, not a retryable failure', async () => {
      const synthesize = vi.fn<SpeechPipelineOptions<Blob>['tts']>().mockResolvedValue(null)
      const harness = synthesisHarness(synthesize)
      await harness.speech.write('Hello.')
      harness.speech.end()
      await vi.advanceTimersByTimeAsync(0)
      expect(await harness.response.finish()).toBe('finished')
      expect(synthesize).toHaveBeenCalledTimes(1)
      expect(harness.play).not.toHaveBeenCalled()
      await harness.controller.close()
    })

    it('cancels a pending retry without another provider call', async () => {
      const synthesize = vi.fn<SpeechPipelineOptions<Blob>['tts']>().mockRejectedValue(synthesisFailure(503))
      const harness = synthesisHarness(synthesize)
      await harness.speech.write('Hello.')
      harness.speech.end()
      await vi.advanceTimersByTimeAsync(0)
      harness.response.cancel('User cancelled')
      expect(await harness.response.finish()).toBe('cancelled')
      await vi.advanceTimersByTimeAsync(1_000)
      expect(synthesize).toHaveBeenCalledTimes(1)
      expect(synthesize.mock.calls[0][1].aborted).toBe(true)
      expect(harness.play).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
      await harness.controller.close()
    })

    it('cancels the retry wait when the producer deadline ends', async () => {
      const synthesize = vi.fn<SpeechPipelineOptions<Blob>['tts']>().mockRejectedValue(synthesisFailure(503))
      const harness = synthesisHarness(synthesize)
      harness.speech.cancel('Use a producer with a deadline')
      const speech = harness.response.openSpeech({ purpose: 'short acknowledgment', deadlineMs: 100 })
      await speech.write('Hello.')
      speech.end()
      await vi.advanceTimersByTimeAsync(100)
      expect(await speech.done).toEqual({ status: 'cancelled', reason: 'Speech deadline ended' })
      await vi.advanceTimersByTimeAsync(1_000)
      expect(synthesize).toHaveBeenCalledTimes(1)
      expect(harness.play).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
      await harness.response.finish()
      await harness.controller.close()
    })

    it('does not play audio returned by an in-flight retry after cancellation', async () => {
      const pending = Promise.withResolvers<Blob>()
      const synthesize = vi.fn<SpeechPipelineOptions<Blob>['tts']>()
        .mockRejectedValueOnce(synthesisFailure(503))
        .mockImplementation(() => pending.promise)
      const harness = synthesisHarness(synthesize)
      await harness.speech.write('Hello.')
      harness.speech.end()
      await vi.advanceTimersByTimeAsync(300)
      expect(synthesize).toHaveBeenCalledTimes(2)
      harness.response.cancel('User cancelled')
      expect(await harness.response.finish()).toBe('cancelled')
      pending.resolve(new Blob(['Late audio']))
      await vi.advanceTimersByTimeAsync(1_000)
      expect(synthesize).toHaveBeenCalledTimes(2)
      expect(harness.play).not.toHaveBeenCalled()
      await harness.controller.close()
    })

    it('does not retry a bidirectional provider that fails after emitting audio', async () => {
      const play = vi.fn<PlaybackDriver['play']>(() => ({
        done: Promise.resolve({ throughMs: 1 }),
        stop: async () => ({ throughMs: 0 }),
      }))
      const playback = new Playback({ nowMs: () => 0, play })
      const output = createPushStream<SpeechAudio>()
      const stream = vi.fn(async () => output.stream)
      const controller = new VoiceController({ speech: () => ({ playback, stream }) })
      const response = controller.openResponse({ sessionId: 'alice', turnId: 'streaming' })
      const speech = response.openSpeech({ purpose: 'answer' })
      await speech.write('Hello.')
      output.write({ audio: new Blob(['Partial audio']) })
      await vi.advanceTimersByTimeAsync(0)
      expect(play).toHaveBeenCalledTimes(1)
      output.error(synthesisFailure(503))
      await vi.advanceTimersByTimeAsync(1_000)
      expect(await response.finish()).toBe('failed')
      expect(stream).toHaveBeenCalledTimes(1)
      expect(play).toHaveBeenCalledTimes(1)
      await controller.close()
    })

    it('keeps later speech behind a producer whose synthesis is retrying', async () => {
      const first = new Blob(['First.'])
      const last = new Blob(['Last.'])
      let firstAttempts = 0
      const synthesize = vi.fn<SpeechPipelineOptions<Blob>['tts']>(async (request) => {
        if (request.text === 'First.') {
          if (++firstAttempts === 1)
            throw synthesisFailure(503)
          return first
        }
        return last
      })
      const harness = synthesisHarness(synthesize)
      const later = harness.response.openSpeech({ purpose: 'later' })
      await harness.speech.write('First.')
      harness.speech.end()
      await later.write('Last.')
      later.end()
      await vi.advanceTimersByTimeAsync(0)
      expect(synthesize).toHaveBeenCalledTimes(2)
      expect(harness.play).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(300)
      expect(await harness.response.finish()).toBe('finished')
      expect(harness.play.mock.calls.map(([clip]) => clip.audio)).toEqual([first, last])
      await harness.controller.close()
    })

    it('keeps concurrent segments in text order while an earlier segment retries', async () => {
      const first = new Blob(['First.'])
      const last = new Blob(['Last.'])
      let firstAttempts = 0
      const synthesize = vi.fn<SpeechPipelineOptions<Blob>['tts']>(async (request) => {
        if (request.text === 'First.') {
          if (++firstAttempts === 1)
            throw synthesisFailure(503)
          return first
        }
        return last
      })
      const harness = synthesisHarness(synthesize)
      await harness.speech.write('First. Last.')
      harness.speech.end()
      await vi.advanceTimersByTimeAsync(0)
      expect(synthesize.mock.calls.map(([request]) => request.text)).toEqual(['First.', 'Last.'])
      expect(harness.play).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(300)
      expect(await harness.response.finish()).toBe('finished')
      expect(harness.play.mock.calls.map(([clip]) => clip.audio)).toEqual([first, last])
      expect(synthesize.mock.calls[2][0].segmentId).toBe(synthesize.mock.calls[0][0].segmentId)
      await harness.controller.close()
    })
  })

  it('ends the speaking indicator only after cancelled audio becomes silent', async () => {
    const silence = Promise.withResolvers<{ throughMs: number }>()
    const started = vi.fn()
    const ended = vi.fn()
    const playback = new Playback({ nowMs: () => 0, play: (clip) => {
      clip.onStart?.()
      return { done: new Promise<{ throughMs: number }>(() => {}), stop: () => silence.promise }
    } })
    const controller = new VoiceController({
      speech: () => ({ playback, synthesize: async () => new Blob(['speech']), onPlaybackStart: started, onPlaybackEnd: ended }),
    })
    const response = controller.openResponse({ sessionId: 'alice', turnId: 'indicator' })
    const speech = response.openSpeech({ purpose: 'answer' })
    await speech.write('Hello.')
    speech.end()
    await expect.poll(() => started.mock.calls.length).toBe(1)
    speech.cancel('Acknowledgment replaced')
    expect(ended).not.toHaveBeenCalled()
    silence.resolve({ throughMs: 10 })
    await response.finish()
    await expect.poll(() => ended.mock.calls.length).toBe(1)
    await controller.close()
  })

  it('reports a finished response as silent when a later input interrupts it', async () => {
    const playback = new Playback({ nowMs: () => 0, play: () => ({ done: Promise.resolve({ throughMs: 1 }), stop: async () => ({ throughMs: 0 }) }) })
    const controller = new VoiceController({ speech: () => ({ playback, synthesize: async () => new Blob(['speech']) }) })
    const turn = { sessionId: 'alice', turnId: 'finished' }
    const response = controller.openResponse(turn)
    const speech = response.openSpeech({ purpose: 'answer' })
    speech.write('Done.')
    speech.end()
    expect(await response.finish()).toBe('finished')

    const interruption = controller.interrupt({ turns: [turn], cause: 'speech-input' })

    expect(await interruption.silenced).toEqual([{ turn, status: 'silent' }])
    expect(await interruption.done).toEqual({ status: 'recorded', notifications: [] })
    await controller.close()
  })

  it('preserves earlier reserved speech when an intermediate producer is cancelled', async () => {
    const firstAudio = Promise.withResolvers<Blob>()
    const played: string[] = []
    const requested: string[] = []
    const playback = new Playback({ nowMs: () => 0, play: clip => ({
      done: (clip.audio as Blob).text().then((text) => {
        played.push(text)
        return { throughMs: 1 }
      }),
      stop: async () => ({ throughMs: 0 }),
    }) })
    const controller = new VoiceController({ transcriber: vi.fn(), submit: vi.fn(), speech: () => ({ playback, synthesize: async (request) => {
      requested.push(request.text)
      return request.text === 'First.' ? firstAudio.promise : new Blob([request.text])
    } }) })
    const response = controller.openResponse({ sessionId: 'alice', turnId: 'ordered' })
    const first = response.openSpeech({ purpose: 'first' })
    const middle = response.openSpeech({ purpose: 'middle' })
    const last = response.openSpeech({ purpose: 'last' })
    await first.write('First.')
    first.end()
    await last.write('Last.')
    last.end()
    middle.cancel('Skipped')
    await expect.poll(() => requested).toContain('Last.')
    expect(played).toEqual([])
    firstAudio.resolve(new Blob(['First.']))
    expect(await response.finish()).toBe('finished')
    expect(played).toEqual(['First.', 'Last.'])
    await controller.close()
  })

  it('plays bidirectional synthesis output before its text input ends', async () => {
    const words: string[] = []
    const samples: number[] = []
    const captions: string[] = []
    const output = createPushStream<SpeechAudio>()
    const playback = new Playback({ nowMs: () => 0, play: (clip) => {
      if (!(clip.audio instanceof ReadableStream))
        throw new Error('Expected streaming PCM')
      clip.onStart?.()
      const reader = clip.audio.getReader()
      const done = (async () => {
        while (true) {
          const result = await reader.read()
          if (result.done)
            break
          samples.push(...result.value.channels[0])
        }
        reader.releaseLock()
        return { throughMs: samples.length }
      })()
      return { done, stop: async () => {
        await reader.cancel()
        return { throughMs: samples.length }
      } }
    } })
    const controller = new VoiceController({ transcriber: vi.fn(), submit: vi.fn(), speech: () => ({ playback, onPlaybackStart: clip => captions.push(clip.text), stream: async (text) => {
      void (async () => {
        for await (const part of text)
          words.push(part)
        output.close()
      })()
      return output.stream
    } }) })
    const response = controller.openResponse({ sessionId: 'alice', turnId: 'answer' })
    const speech = response.openSpeech({ purpose: 'answer' })
    await speech.write('Hello')
    await expect.poll(() => words).toEqual(['Hello'])
    output.write({ text: 'Hello', audio: new ReadableStream({ start(controller) {
      controller.enqueue({ range: { sourceId: 'tts', startFrame: 0, endFrame: 2 }, sampleRate: 1000, channels: [new Float32Array([0.25, 0.5])] })
      controller.close()
    } }) })
    await expect.poll(() => samples).toEqual([0.25, 0.5])
    expect(captions).toEqual(['Hello'])
    await speech.write(' there')
    speech.end()
    expect(await response.finish()).toBe('finished')
    expect(words).toEqual(['Hello', ' there'])
    await controller.close()
  })

  it('retains speech-onset samples while waiting for playback silence', async () => {
    const source = createPushStream<import('@proj-airi/pipelines-audio').PcmBlock>()
    const audio = new AudioInput(pcmSource(source.stream), { historyMs: 4 })
    const release = keepOpen(audio)
    const playing = Promise.withResolvers<void>()
    const faded = Promise.withResolvers<{ throughMs: number }>()
    const playback = new Playback({ nowMs: () => 0, play: () => {
      playing.resolve()
      return { done: new Promise<{ throughMs: number }>(() => {}), stop: () => faded.promise }
    } })
    const samples: number[] = []
    const output = createPushStream<TranscriptionEvent>()
    const transcribe = vi.fn<StreamingTranscriber['transcribe']>((request) => {
      const stream = request.audio
      void (async () => {
        for await (const block of stream) samples.push(...block.channels[0])
      })().catch(() => {})
      return output.stream
    })
    const controller = new VoiceController({ audio, transcriber: () => ({ transcribe }), submit: vi.fn(), speech: () => ({ playback, synthesize: async () => new Blob(['speech']) }), recordInterruption: async () => ({ status: 'queued' }) })
    const turn = { sessionId: 'alice', turnId: 'answer' }
    const speech = controller.openResponse(turn).openSpeech({ purpose: 'answer' })
    await speech.write('Current answer.')
    speech.end()
    await playing.promise
    source.write({ range: { sourceId: 'mic', startFrame: 0, endFrame: 4 }, sampleRate: 1000, channels: [new Float32Array([1, 2, 3, 4])] })
    await expect.poll(() => audio.position?.frame).toBe(4)
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [turn], start: { kind: 'speech-onset', at: { sourceId: 'mic', frame: 0 } } })
    source.write({ range: { sourceId: 'mic', startFrame: 4, endFrame: 8 }, sampleRate: 1000, channels: [new Float32Array([5, 6, 7, 8])] })
    await expect.poll(() => audio.position?.frame).toBe(8)
    expect(transcribe).not.toHaveBeenCalled()
    faded.resolve({ throughMs: 20 })
    await expect.poll(() => samples).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(attempt.state.phase).toBe('capturing')
    attempt.cancel('done')
    release()
    await controller.close()
  })

  it('retries a failed interruption record with the original event identity', async () => {
    const recordInterruption = vi.fn().mockResolvedValueOnce({ status: 'failed' }).mockResolvedValue({ status: 'queued' })
    const playback = new Playback({ nowMs: () => 0, play: () => {
      throw new Error('No audio expected')
    } })
    const controller = new VoiceController({ transcriber: vi.fn(), submit: vi.fn(), speech: () => ({ playback, synthesize: async () => null }), recordInterruption })
    const turn = { sessionId: 'alice', turnId: 'reasoning' }
    controller.openResponse(turn)
    const first = controller.interrupt({ turns: [turn], cause: 'button' })
    expect((await first.done).status).toBe('failed')
    const retry = await controller.interrupt({ turns: [turn], cause: 'retry' }).done
    expect(retry.status).toBe('recorded')
    expect(retry.notifications).toHaveLength(1)
    expect(recordInterruption).toHaveBeenCalledTimes(2)
    expect(recordInterruption.mock.calls[1][0].eventId).toBe(recordInterruption.mock.calls[0][0].eventId)
    expect(recordInterruption.mock.calls[1][0].cause).toBe('button')
    await controller.close()
  })

  it('shows pending input until playback confirms silence and fails admission when fade fails', async () => {
    const faded = Promise.withResolvers<{ throughMs: number }>()
    const playing = Promise.withResolvers<void>()
    const playback = new Playback({ nowMs: () => 0, play: () => {
      playing.resolve()
      return { done: new Promise<{ throughMs: number }>(() => {}), stop: () => faded.promise }
    } })
    const audio = new AudioInput(pcmSource(createPushStream<import('@proj-airi/pipelines-audio').PcmBlock>().stream, async () => {}))
    const transcriber = vi.fn()
    const controller = new VoiceController({ audio, transcriber, submit: vi.fn(), speech: () => ({ playback, synthesize: async () => new Blob(['speech']) }), recordInterruption: async () => ({ status: 'queued' }) })
    const turn = { sessionId: 'alice', turnId: 'talking' }
    const response = controller.openResponse(turn)
    const speech = response.openSpeech({ purpose: 'answer' })
    await speech.write('The current answer.')
    speech.end()
    await playing.promise
    const attempt = controller.beginInput({ sessionId: 'alice', interruptTurns: [turn], start: { kind: 'after-silence' } })
    expect(attempt.state).toEqual({ phase: 'pending', waitingFor: 'silence' })
    expect(transcriber).not.toHaveBeenCalled()
    faded.reject(new Error('Playback host lost'))
    expect(await attempt.done).toEqual({ status: 'failed', stage: 'admission', error: expect.any(Error) })
    expect(transcriber).not.toHaveBeenCalled()
    await controller.close()
  })

  it('reserves speech order and interrupts only the named response with a durable control record', async () => {
    const acknowledgment = Promise.withResolvers<Blob>()
    const firstPlayed = Promise.withResolvers<void>()
    const silence = Promise.withResolvers<{ throughMs: number }>()
    const played: string[] = []
    const playback = new Playback({
      nowMs: () => 0,
      play(clip) {
        void (clip.audio as Blob).text().then(text => played.push(text))
        firstPlayed.resolve()
        return { done: new Promise<{ throughMs: number }>(() => {}), stop: () => silence.promise }
      },
    })
    const requests: TtsRequest[] = []
    const recordInterruption = vi.fn(async () => ({ status: 'queued' as const }))
    const controller = new VoiceController({
      transcriber: () => {
        throw new Error('No transcriber')
      },
      submit: async () => ({ status: 'drafted', draftId: 'unused' }),
      speech: () => ({ playback, async synthesize(request) {
        requests.push(request)
        return request.text === 'Let me think.' ? acknowledgment.promise : new Blob([request.text])
      } }),
      recordInterruption,
    })
    const turn = { sessionId: 'alice', turnId: 'reply-1' }
    const response = controller.openResponse(turn)
    expect(controller.openResponse(turn)).toBe(response)
    const early = response.openSpeech({ purpose: 'acknowledgment' })
    const answer = response.openSpeech({ purpose: 'answer' })
    await early.write('Let me think.')
    early.end()
    await answer.write('Here is my answer.')
    answer.end()
    await expect.poll(() => requests.length).toBe(2)
    expect(played).toEqual([])
    acknowledgment.resolve(new Blob(['Let me think.']))
    await firstPlayed.promise
    const unrelated = controller.openResponse({ sessionId: 'bob', turnId: 'reply-2' })
    const interruption = controller.interrupt({ turns: [turn], cause: 'button' })
    expect(response.signal.aborted).toBe(true)
    expect(unrelated.signal.aborted).toBe(false)
    expect(await answer.write('late text')).toEqual({ status: 'closed' })
    expect(recordInterruption).not.toHaveBeenCalled()
    silence.resolve({ throughMs: 120 })
    expect((await interruption.silenced)[0].status).toBe('silent')
    expect((await interruption.done).status).toBe('recorded')
    expect(recordInterruption).toHaveBeenCalledWith(expect.objectContaining({ eventId: expect.any(String), turn, cause: 'button', playback: expect.objectContaining({ played: [expect.objectContaining({ throughMs: 120 })] }) }))
    expect(await response.finish()).toBe('interrupted')
    expect(played).toEqual(['Let me think.'])
    expect(() => controller.openResponse(turn)).toThrow('already used')
    unrelated.cancel('No longer needed')
    expect(recordInterruption).toHaveBeenCalledTimes(1)
    await controller.close()
  })
})
