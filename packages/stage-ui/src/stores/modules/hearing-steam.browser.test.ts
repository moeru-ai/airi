import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

import { useHearingSpeechInputPipeline, useHearingStore } from './hearing'

let pinia: ReturnType<typeof createPinia>
beforeEach(() => {
  localStorage.clear()
  pinia = createPinia()
  vi.stubEnv('VITE_DISTRIBUTION', 'steam')
})
afterEach(() => {
  disposePinia(pinia)
  localStorage.clear()
  vi.unstubAllEnvs()
})

function mountHearing() {
  let hearing!: ReturnType<typeof useHearingStore>
  let pipeline!: ReturnType<typeof useHearingSpeechInputPipeline>
  render(defineComponent({
    setup() {
      hearing = useHearingStore()
      pipeline = useHearingSpeechInputPipeline()
      return () => h('div')
    },
  }), { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
  return { hearing, pipeline }
}

it.each(['official-provider-transcription', 'browser-web-speech-api'])('migrates persisted %s before the first login', (providerId) => {
  localStorage.setItem('settings/hearing/active-provider', providerId)
  localStorage.setItem('settings/hearing/active-model', 'cloud-model')
  localStorage.setItem('settings/hearing/active-custom-model', 'custom-cloud-model')
  const { hearing } = mountHearing()
  expect(hearing.activeTranscriptionProvider).toBe('sherpaw-transcription')
  expect(hearing.activeTranscriptionModel).toBe('sherpaw')
  expect(hearing.activeCustomModelName).toBe('')
})

it('keeps a replicated selection stable and blocks Web Speech execution without a repair watcher', async () => {
  const { hearing, pipeline } = mountHearing()
  hearing.$patch({ activeTranscriptionProvider: 'browser-web-speech-api', activeTranscriptionModel: 'web-speech-api' })
  await nextTick()
  // A follower must not rewrite replicated state. The execution guard rejects
  // it until the leader applies the explicit defaults command.
  expect(hearing.activeTranscriptionProvider).toBe('browser-web-speech-api')
  expect(hearing.configured).toBe(false)
  await pipeline.transcribeForMediaStream(new MediaStream(), { consumerId: 'steam-regression' })
  expect(pipeline.error).toContain('Steam requires local Sherpaw')
  expect(pipeline.isTranscribing).toBe(false)
})
