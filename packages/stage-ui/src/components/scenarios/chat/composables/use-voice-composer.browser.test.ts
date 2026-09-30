import type { VoiceComposerMode, VoiceComposerOptions } from './use-voice-composer'

import en from '@proj-airi/i18n/locales/en'
import zhHans from '@proj-airi/i18n/locales/zh-Hans'

import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, shallowRef } from 'vue'
import { createI18n } from 'vue-i18n'

import { useAudioContext } from '../../../../stores/audio'
import { useHearingStore } from '../../../../stores/modules/hearing'
import { useProviderStore } from '../../../../stores/providers/provider'
import { useVoiceComposer } from './use-voice-composer'

const vadStartup = vi.hoisted(() => ({ pending: undefined as Promise<void> | undefined, speechStart: false, started: vi.fn(), disposed: vi.fn() }))
vi.mock('../../../../stores/ai/models/vad', () => ({
  useVAD: (_worker: string, options: { onSpeechStart?: () => void }) => ({
    init: () => {
      vadStartup.started()
      return vadStartup.pending
    },
    loaded: { value: true },
    inferenceError: { value: '' },
    start: () => {
      if (vadStartup.speechStart)
        options.onSpeechStart?.()
    },
    dispose: vadStartup.disposed,
  }),
}))

const contexts: AudioContext[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vadStartup.pending = undefined
  vadStartup.speechStart = false
  vadStartup.started.mockClear()
  vadStartup.disposed.mockClear()
  await Promise.all(contexts.splice(0).map(context => context.close()))
})

function microphone() {
  const context = new AudioContext()
  contexts.push(context)
  const oscillator = context.createOscillator()
  const destination = context.createMediaStreamDestination()
  oscillator.connect(destination)
  oscillator.start()
  void context.resume()
  return destination.stream
}

function mountVoice(complete = vi.fn<VoiceComposerOptions['complete']>().mockResolvedValue(undefined), transcription = false, mode: VoiceComposerMode = transcription ? 'transcription' : 'audio', locale = 'en') {
  let voice!: ReturnType<typeof useVoiceComposer>
  let audioContext!: AudioContext
  const session = shallowRef('session-1')
  const errors = vi.fn()
  const screen = render(defineComponent({
    setup() {
      if (transcription) {
        const hearing = useHearingStore()
        hearing.activeTranscriptionProvider = 'browser-web-speech-api'
        hearing.activeTranscriptionModel = 'web-speech-api'
      }
      voice = useVoiceComposer({ sessionId: session, needsTranscription: () => false, complete, onError: errors })
      audioContext = useAudioContext().audioContext
      return () => h('button', {
        onClick: () => {
          for (const context of contexts)
            void context.resume()
          void voice.start(mode)
        },
      }, 'Record')
    },
  }), { global: { plugins: [createPinia(), createI18n({ legacy: false, locale, messages: { en, 'zh-Hans': zhHans } })] } })
  return { voice, audioContext, complete, errors, session, screen }
}

describe('manual voice recording lifecycle', () => {
  it('reports microphone errors in the selected locale', async () => {
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))
    const { voice, errors, screen } = mountVoice(undefined, false, 'audio', 'zh-Hans')

    await screen.getByRole('button', { name: 'Record' }).click()
    await expect.poll(() => voice.phase.value).toBe('idle')
    expect(errors).toHaveBeenCalledWith('无法开始录音。')
  })

  it('finalizes a real WAV and releases microphone tracks before delivery', async () => {
    const stream = microphone()
    // The hardware boundary supplies real browser audio tracks. Recorder and analyser stay real.
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(stream)
    const { voice, complete, errors, screen } = mountVoice()
    await screen.getByRole('button', { name: 'Record' }).click()
    await expect.poll(() => voice.phase.value).toBe('recording')
    await expect.poll(() => voice.volume.value).toBeGreaterThan(0)
    const captureStart = contexts[0].currentTime
    await expect.poll(() => contexts[0].currentTime - captureStart).toBeGreaterThan(0.25)
    await voice.finish()
    expect(errors).not.toHaveBeenCalled()
    expect(complete).toHaveBeenCalledOnce()
    const result = complete.mock.calls[0][0]
    if (result.mode !== 'audio')
      throw new Error('Expected audio recording')
    expect(result.audio.mimeType).toBe('audio/wav')
    expect(atob(result.audio.data).slice(0, 4)).toBe('RIFF')
    expect(result.sessionId).toBe('session-1')
    expect(stream.getTracks()[0].readyState).toBe('ended')
    expect(voice.phase.value).toBe('idle')
  })

  it('finishes a recording when its duration limit arrives', async () => {
    const schedule = globalThis.setTimeout.bind(globalThis)
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((handler, delay, ...args) =>
      schedule(handler, delay === 90_000 ? 1500 : delay, ...args))
    const stream = microphone()
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(stream)
    const { voice, complete, errors, screen } = mountVoice()

    await screen.getByRole('button', { name: 'Record' }).click()
    await expect.poll(() => voice.phase.value).toBe('recording')
    await expect.poll(() => complete.mock.calls.length, { timeout: 5000 }).toBe(1)
    expect(errors).not.toHaveBeenCalled()
    expect(voice.phase.value).toBe('idle')
    expect(stream.getTracks()[0].readyState).toBe('ended')
  })

  it('waits for Web Speech results delivered after release', async () => {
    // ROOT CAUSE:
    // Normal release aborted the recognition result before stop could deliver
    // its final event, so a recording without interim text became an empty transcript.
    class Recognition {
      onresult?: (event: { resultIndex: number, results: { isFinal: boolean, 0: { transcript: string } }[] }) => void
      onend?: () => void
      start() {}
      stop() {
        setTimeout(() => {
          this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: '你好世界' } }] })
          this.onend?.()
        }, 20)
      }

      abort() { this.onend?.() }
    }
    vi.stubGlobal('SpeechRecognition', Recognition)
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(microphone())
    const { voice, complete, errors, screen } = mountVoice(undefined, true)
    await screen.getByRole('button', { name: 'Record' }).click()
    await expect.poll(() => voice.phase.value).toBe('recording')
    await expect.poll(() => voice.volume.value).toBeGreaterThan(0)
    const captureStart = contexts[0].currentTime
    await expect.poll(() => contexts[0].currentTime - captureStart).toBeGreaterThan(0.25)
    await voice.finish()
    expect(errors).not.toHaveBeenCalled()
    expect(complete).toHaveBeenCalledOnce()
    expect(complete.mock.calls[0][0]).toEqual({ sessionId: 'session-1', mode: 'transcription', text: '你好世界' })
  })

  it('saves a live transcript for native audio when file transcription is unavailable', async () => {
    class Recognition {
      onresult?: (event: { resultIndex: number, results: { isFinal: boolean, 0: { transcript: string } }[] }) => void
      onend?: () => void
      start() {}
      stop() {
        this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'saved words' } }] })
        this.onend?.()
      }

      abort() { this.onend?.() }
    }
    vi.stubGlobal('SpeechRecognition', Recognition)
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(microphone())
    const { voice, complete, screen } = mountVoice(undefined, true, 'audio')
    await screen.getByRole('button', { name: 'Record' }).click()
    await expect.poll(() => voice.phase.value).toBe('recording')
    const captureStart = contexts[0].currentTime
    await expect.poll(() => contexts[0].currentTime - captureStart).toBeGreaterThan(0.25)

    await voice.finish()

    expect(complete).toHaveBeenCalledOnce()
    const result = complete.mock.calls[0][0]
    if (result.mode !== 'audio')
      throw new Error('Expected audio recording')
    expect(result.audio.transcript).toBe('saved words')
  })

  it('keeps committed text after a later empty recognition cycle', async () => {
    class Recognition {
      static current: Recognition | undefined
      onresult?: (event: { resultIndex: number, results: { isFinal: boolean, 0: { transcript: string } }[] }) => void
      onend?: () => void
      onspeechstart?: () => void
      onspeechend?: () => void
      constructor() { Recognition.current = this }
      start() {}
      stop() { this.onend?.() }
      abort() { this.onend?.() }
    }
    vi.stubGlobal('SpeechRecognition', Recognition)
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(microphone())
    const { voice, complete, errors, screen } = mountVoice(undefined, true)
    await screen.getByRole('button', { name: 'Record' }).click()
    await expect.poll(() => voice.phase.value).toBe('recording')
    const captureStart = contexts[0].currentTime
    await expect.poll(() => contexts[0].currentTime - captureStart).toBeGreaterThan(0.25)

    const activeRecognition = Recognition.current
    if (!activeRecognition)
      throw new Error('Recognition did not start')
    activeRecognition.onspeechstart?.()
    activeRecognition.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'first words' } }] })
    activeRecognition.onspeechstart?.()
    activeRecognition.onspeechend?.()
    activeRecognition.onend?.()
    await voice.finish()

    expect(errors).not.toHaveBeenCalled()
    expect(complete.mock.calls[0][0].text).toBe('first words')
  })

  it('cancels a streaming stop when recognition never reports its final result', async () => {
    let stops = 0
    class Recognition {
      start() {}
      stop() { stops++ }
      abort() {}
    }
    vi.stubGlobal('SpeechRecognition', Recognition)
    const stream = microphone()
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(stream)
    const { voice, complete, errors, screen } = mountVoice(undefined, true)
    await screen.getByRole('button', { name: 'Record' }).click()
    await expect.poll(() => voice.phase.value).toBe('recording')

    const finishing = voice.finish()
    await expect.poll(() => stops).toBe(1)
    await voice.cancel()
    await finishing

    expect(voice.phase.value).toBe('idle')
    expect(stream.getTracks()[0].readyState).toBe('ended')
    expect(complete).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
  })

  it('drains recognition before the recorder suspends its audio context', async () => {
    // ROOT CAUSE:
    // Mediabunny's Web Audio capture path suspends its context on finalization.
    // A browser audio-session interruption must not run before recognition drains.
    let recognizing = false
    let interrupted = false
    class Recognition {
      onresult?: (event: { resultIndex: number, results: { isFinal: boolean, 0: { transcript: string } }[] }) => void
      onend?: () => void
      start() { recognizing = true }
      stop() {
        if (!interrupted)
          this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'final words' } }] })
        recognizing = false
        this.onend?.()
      }

      abort() {
        recognizing = false
        this.onend?.()
      }
    }
    vi.stubGlobal('SpeechRecognition', Recognition)
    // Safari uses Mediabunny's real Web Audio capture path, without a track processor.
    vi.stubGlobal('MediaStreamTrackProcessor', undefined)
    const stream = microphone()
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(stream)
    const suspend = AudioContext.prototype.suspend
    vi.spyOn(AudioContext.prototype, 'suspend').mockImplementation(function (this: AudioContext) {
      if (recognizing)
        interrupted = true
      return suspend.call(this)
    })
    const { voice, complete, errors, screen } = mountVoice(undefined, true)
    await screen.getByRole('button', { name: 'Record' }).click()
    await expect.poll(() => voice.phase.value).toBe('recording')
    await expect.poll(() => voice.volume.value).toBeGreaterThan(0)
    // Allow the 4096-frame capture buffer to produce its first WAV packet.
    await new Promise(resolve => setTimeout(resolve, 200))
    await voice.finish()
    expect(interrupted).toBe(false)
    expect(errors).not.toHaveBeenCalled()
    expect(complete.mock.calls[0][0].text).toBe('final words')
  })

  it('does not send after cancellation while microphone permission is pending', async () => {
    const stream = microphone()
    const permission = Promise.withResolvers<MediaStream>()
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockReturnValue(permission.promise)
    const { voice, complete } = mountVoice()
    const starting = voice.start('audio')
    await voice.cancel()
    expect(voice.phase.value).toBe('idle')
    expect(complete).not.toHaveBeenCalled()
    permission.resolve(stream)
    await starting
    expect(complete).not.toHaveBeenCalled()
    expect(stream.getTracks()[0].readyState).toBe('ended')
    expect(voice.phase.value).toBe('idle')
  })

  it('ends a released recording while microphone permission is pending', async () => {
    const stream = microphone()
    const permission = Promise.withResolvers<MediaStream>()
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockReturnValue(permission.promise)
    const { voice, complete } = mountVoice()
    const starting = voice.start('audio')

    await voice.finish()
    expect(voice.phase.value).toBe('idle')
    expect(complete).not.toHaveBeenCalled()

    permission.resolve(stream)
    await starting
    expect(stream.getTracks()[0].readyState).toBe('ended')
  })

  it('cancels while audio context resume remains pending', async () => {
    const stream = microphone()
    const getUserMedia = vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(stream)
    const { voice, audioContext, complete } = mountVoice()
    const resume = Promise.withResolvers<void>()
    vi.spyOn(audioContext, 'resume').mockReturnValueOnce(resume.promise)

    const starting = voice.start('audio')
    await expect.poll(() => getUserMedia.mock.calls.length).toBe(1)
    await expect.poll(() => voice.phase.value).toBe('starting')
    await new Promise(resolve => setTimeout(resolve, 50))
    await voice.cancel()
    await starting

    expect(voice.phase.value).toBe('idle')
    expect(stream.getTracks()[0].readyState).toBe('ended')
    expect(complete).not.toHaveBeenCalled()
  })

  it('cancels while streaming transcription startup is pending', async () => {
    const stream = microphone()
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(stream)
    const { voice, complete, errors, screen } = mountVoice()
    const hearing = useHearingStore()
    hearing.activeTranscriptionProvider = 'pending-vad-test'
    hearing.activeTranscriptionModel = 'test-model'
    vi.spyOn(useProviderStore(), 'getTranscriptionFeatures').mockReturnValue({ supportsGenerate: false, supportsStreamOutput: false, supportsStreamInput: true })
    vadStartup.pending = Promise.withResolvers<void>().promise

    await screen.getByRole('button', { name: 'Record' }).click()
    await expect.poll(() => vadStartup.started.mock.calls.length).toBe(1)
    await voice.cancel()

    expect(voice.phase.value).toBe('idle')
    expect(stream.getTracks()[0].readyState).toBe('ended')
    expect(vadStartup.disposed).toHaveBeenCalledOnce()
    expect(complete).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
  })

  it('releases the microphone at the duration limit when VAD startup stalls', async () => {
    const schedule = globalThis.setTimeout.bind(globalThis)
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((handler, delay, ...args) =>
      schedule(handler, delay === 90_000 ? 1500 : delay, ...args))
    const stream = microphone()
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(stream)
    const { voice, complete, errors, screen } = mountVoice()
    const hearing = useHearingStore()
    hearing.activeTranscriptionProvider = 'pending-vad-test'
    hearing.activeTranscriptionModel = 'test-model'
    vi.spyOn(useProviderStore(), 'getTranscriptionFeatures').mockReturnValue({ supportsGenerate: false, supportsStreamOutput: false, supportsStreamInput: true })
    vadStartup.pending = Promise.withResolvers<void>().promise

    await screen.getByRole('button', { name: 'Record' }).click()
    await expect.poll(() => vadStartup.started.mock.calls.length).toBe(1)
    await expect.poll(() => voice.phase.value, { timeout: 5000 }).toBe('idle')

    expect(stream.getTracks()[0].readyState).toBe('ended')
    expect(complete).not.toHaveBeenCalled()
    expect(errors).toHaveBeenCalledOnce()
  })

  it('cancels while a streaming provider is starting', async () => {
    const stream = microphone()
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(stream)
    const { voice, complete, errors, screen } = mountVoice()
    const hearing = useHearingStore()
    hearing.activeTranscriptionProvider = 'pending-provider-test'
    hearing.activeTranscriptionModel = 'test-model'
    const providers = useProviderStore()
    vi.spyOn(providers, 'getTranscriptionFeatures').mockReturnValue({ supportsGenerate: false, supportsStreamOutput: false, supportsStreamInput: true })
    const createProvider = vi.spyOn(providers, 'getProviderInstance').mockImplementation(async () => await new Promise<never>(() => {}))
    vadStartup.speechStart = true

    await screen.getByRole('button', { name: 'Record' }).click()
    await expect.poll(() => createProvider.mock.calls.length).toBe(1)
    await voice.cancel()

    expect(voice.phase.value).toBe('idle')
    expect(stream.getTracks()[0].readyState).toBe('ended')
    expect(vadStartup.disposed).toHaveBeenCalledOnce()
    expect(complete).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
  })

  it('ends a released recording while a streaming provider is starting', async () => {
    const stream = microphone()
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(stream)
    const { voice, complete, screen } = mountVoice()
    const hearing = useHearingStore()
    hearing.activeTranscriptionProvider = 'pending-provider-test'
    hearing.activeTranscriptionModel = 'test-model'
    const providers = useProviderStore()
    vi.spyOn(providers, 'getTranscriptionFeatures').mockReturnValue({ supportsGenerate: false, supportsStreamOutput: false, supportsStreamInput: true })
    const createProvider = vi.spyOn(providers, 'getProviderInstance').mockImplementation(async () => await new Promise<never>(() => {}))
    vadStartup.speechStart = true

    await screen.getByRole('button', { name: 'Record' }).click()
    await expect.poll(() => createProvider.mock.calls.length).toBe(1)
    await voice.finish()

    expect(voice.phase.value).toBe('idle')
    expect(stream.getTracks()[0].readyState).toBe('ended')
    expect(complete).not.toHaveBeenCalled()
  })

  it('discards a recording when its owning chat session changes', async () => {
    const stream = microphone()
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(stream)
    const { voice, complete, session, screen } = mountVoice()
    await screen.getByRole('button', { name: 'Record' }).click()
    await expect.poll(() => voice.phase.value).toBe('recording')
    session.value = 'session-2'
    await expect.poll(() => voice.phase.value).toBe('idle')
    expect(complete).not.toHaveBeenCalled()
    expect(stream.getTracks()[0].readyState).toBe('ended')
  })
})
