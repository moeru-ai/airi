import type { TtsRequest } from '@proj-airi/pipelines-audio'

import type { SpeechAudio } from '../index'

import { AudioInput, createPushStream, Playback } from '@proj-airi/pipelines-audio'
import { describe, expect, it, vi } from 'vitest'

import { VoiceController } from '../index'
import { keepOpen, pcmSource } from '../testing/audio'

describe('voiceController output', () => {
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
    const output = createPushStream<import('./transcript').TranscriptionEvent>()
    const transcribe = vi.fn<import('./voice-controller').StreamingTranscriber['transcribe']>((request) => {
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
