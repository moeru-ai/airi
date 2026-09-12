import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { MotionPlugin } from '@vueuse/motion'
import { createPinia, disposePinia } from 'pinia'
import { expect, it, vi } from 'vitest'
import { createApp, h, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import CardCreationDialog from '../../../../stage-pages/src/pages/settings/airi-card/components/CardCreationDialog.vue'

import { useProviderConfigStore } from '../providers/config'
import { useAiriCardStore } from './airi-card'
import { useSpeechStore } from './speech'

// https://github.com/moeru-ai/airi/pull/2490#discussion_r3967236115
// ROOT CAUSE: Unsaved dialog selections loaded into the runtime catalog and
// cleared its selected voice. Preview responses must remain local to the dialog.
it.each(['completed', 'closed', 'replaced'])('isolates card preview responses when %s', async (scenario) => {
  localStorage.clear()
  let voice = 'runtime'
  const fetchVoices = vi.fn<typeof fetch>(async () => Response.json({ voices: [{ id: voice, name: voice, languages: [] }], data: [] }))
  vi.stubGlobal('fetch', fetchVoices)
  const deferred = Promise.withResolvers<Response>()
  const pinia = createPinia()
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  const open = ref(false)
  const cardId = ref('')
  const container = document.createElement('div')
  document.body.append(container)
  const app = createApp({
    setup() {
      useSpeechStore()
      return () => h(CardCreationDialog, { modelValue: open.value, cardId: cardId.value, initialTab: 'modules' })
    },
  })
  app.use(pinia).use(PiniaColada).use(MotionPlugin).use(i18n).use(createRouter({ history: createMemoryHistory(), routes: [] })).mount(container)
  try {
    const speech = useSpeechStore(pinia)
    await useProviderConfigStore(pinia).ensureProvider('microsoft-speech', 'microsoft-speech', {
      apiKey: 'key',
      baseUrl: 'https://voices.invalid/v1/',
      region: 'eastasia',
    })
    await speech.selectProviderModel('microsoft-speech', 'runtime-model')
    await vi.waitFor(() => expect(speech.availableVoices['microsoft-speech']?.[0]?.id).toBe('runtime'))
    speech.activeSpeechVoiceId = 'runtime'
    await speech.ensureActiveSpeechVoice()
    const cards = useAiriCardStore(pinia)
    /** Creates an inactive draft so changing the dialog never activates it. */
    async function draft(model: string) {
      return cards.addCard({
        name: 'Preview',
        version: '1.0',
        description: '',
        extensions: { airi: { modules: { speech: { provider: 'microsoft-speech', model, voice_id: '' } } } },
      }, 'scratch')
    }
    cardId.value = await draft('preview-model')
    voice = 'preview'
    fetchVoices.mockClear()
    if (scenario !== 'completed')
      fetchVoices.mockImplementationOnce(() => deferred.promise)
    open.value = true
    await vi.waitFor(() => expect(fetchVoices).toHaveBeenCalled())
    if (scenario === 'closed') {
      open.value = false
    }
    else if (scenario === 'replaced') {
      cardId.value = await draft('newer-model')
      await vi.waitFor(() => expect(fetchVoices.mock.calls.length).toBeGreaterThan(1))
    }
    deferred.resolve(Response.json({ voices: [{ id: 'obsolete', name: 'Obsolete', languages: [] }] }))
    await new Promise(resolve => setTimeout(resolve, 100))
    if (scenario !== 'closed') {
      const label = Array.from(document.querySelectorAll('label')).find(element => element.textContent?.trim() === i18n.global.t('settings.pages.card.speech.voice'))
      const trigger = label?.parentElement?.querySelector('button')
      expect(trigger).toBeTruthy()
      trigger!.click()
      await vi.waitFor(() => expect(Array.from(document.querySelectorAll('[role="option"]')).some(element => element.textContent?.includes('preview'))).toBe(true))
      expect(Array.from(document.querySelectorAll('[role="option"]')).some(element => element.textContent?.includes('Obsolete'))).toBe(false)
      open.value = false
    }
    expect(speech.activeSpeechModel).toBe('runtime-model')
    expect(speech.activeSpeechVoiceId).toBe('runtime')
    expect(speech.availableVoices['microsoft-speech']?.[0]?.id).toBe('runtime')
  }
  finally {
    deferred.resolve(Response.json({ voices: [] }))
    app.unmount()
    disposePinia(pinia)
    container.remove()
    vi.unstubAllGlobals()
    localStorage.clear()
  }
})
