import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useAiriCardStore } from '../stores/modules/airi-card'
import { useHearingStore } from '../stores/modules/hearing'
import { useSettingsAudioDevice } from '../stores/settings/audio-device'
import { useStageHearing } from './use-stage-hearing'

let runtime: ReturnType<typeof useStageHearing> | undefined
let context: AudioContext | undefined
let pinia: ReturnType<typeof createPinia> | undefined

afterEach(async () => {
  await runtime?.pause()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await context?.close()
  if (pinia)
    disposePinia(pinia)
  localStorage.clear()
})

// https://github.com/moeru-ai/airi/pull/2708
// ROOT CAUSE: Arming the timeout after provider startup replaced the timeout cleared by an early speech-start event.
it('keeps speaking after the wake deadline when speech starts during provider startup (Issue #2708)', async () => {
  const recognitions: Recognition[] = []
  class Recognition {
    onspeechstart?: () => void
    onend?: () => void
    abort = vi.fn(() => this.onend?.())
    constructor() { recognitions.push(this) }
    start() { this.onspeechstart?.() }
    stop() { this.onend?.() }
  }
  vi.stubGlobal('SpeechRecognition', Recognition)
  context = new AudioContext()
  const destination = context.createMediaStreamDestination()
  vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(destination.stream)
  pinia = createPinia()
  let ready!: Promise<void>
  let device!: ReturnType<typeof useSettingsAudioDevice>
  render(defineComponent({
    setup() {
      const cards = useAiriCardStore()
      ready = cards.initialize()
      const hearing = useHearingStore()
      hearing.activeTranscriptionProvider = 'browser-web-speech-api'
      hearing.activeTranscriptionModel = 'web-speech-api'
      device = useSettingsAudioDevice()
      device.mode = 'wake-word'
      runtime = useStageHearing({ consumerId: 'deadline-test', onError: () => {} })
      return () => h('div')
    },
  }), { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
  await ready
  device.enabled = true
  await expect.poll(() => runtime!.preparation.value).toBe('unconfigured')
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  expect(await runtime!.armWake('default')).toBe(true)
  expect(recognitions).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(15_001)
  expect(recognitions[0]!.abort).not.toHaveBeenCalled()
})
