import type { VoiceComposerOptions } from './use-voice-composer'

import en from '@proj-airi/i18n/locales/en'

import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, shallowRef } from 'vue'
import { createI18n } from 'vue-i18n'

import { useHearingStore } from '../../../../stores/modules/hearing'
import { useVoiceComposer } from './use-voice-composer'

const contexts: AudioContext[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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

function mountVoice(complete = vi.fn<VoiceComposerOptions['complete']>().mockResolvedValue(undefined), transcription = false) {
  let voice!: ReturnType<typeof useVoiceComposer>
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
      return () => h('button', {
        onClick: () => {
          for (const context of contexts)
            void context.resume()
          void voice.start(transcription ? 'transcription' : 'audio')
        },
      }, 'Record')
    },
  }), { global: { plugins: [createPinia(), createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
  return { voice, complete, errors, session, screen }
}

describe('manual voice recording lifecycle', () => {
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
    expect(result.audio.mimeType).toBe('audio/wav')
    expect(atob(result.audio.data).slice(0, 4)).toBe('RIFF')
    expect(result.sessionId).toBe('session-1')
    expect(stream.getTracks()[0].readyState).toBe('ended')
    expect(voice.phase.value).toBe('idle')
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
    expect(complete.mock.calls[0][0].text).toBe('你好世界')
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
    const cancelling = voice.cancel()
    permission.resolve(stream)
    await starting
    await cancelling
    expect(complete).not.toHaveBeenCalled()
    expect(stream.getTracks()[0].readyState).toBe('ended')
    expect(voice.phase.value).toBe('idle')
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
