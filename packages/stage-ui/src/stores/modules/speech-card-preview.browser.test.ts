import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { MotionPlugin } from '@vueuse/motion'
import { createPinia, disposePinia } from 'pinia'
import { expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { createApp, h, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

import CardCreationDialog from '../../../../stage-pages/src/pages/settings/airi-card/components/card-editor/dialog.vue'
import CardsPage from '../../../../stage-pages/src/pages/settings/airi-card/index.vue'

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
        extensions: { airi: { modules: { speech: { provider: 'microsoft-speech', model, voice_id: `saved-${model}` } } } },
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
      const expectedModel = scenario === 'replaced' ? 'newer-model' : 'preview-model'
      for (const [key, expected] of [['model', expectedModel], ['voice', `saved-${expectedModel}`]]) {
        const field = Array.from(document.querySelectorAll('label')).find(element => element.textContent?.trim() === i18n.global.t(`settings.pages.card.speech.${key}`))
        expect(field?.parentElement?.querySelector('input')?.value).toBe(expected)
      }
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

it('discards greeting edits without mutating the stored card', async () => {
  localStorage.clear()
  const pinia = createPinia()
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  const open = ref(false)
  const dialog = ref<InstanceType<typeof CardCreationDialog>>()
  const cardId = ref('')
  const container = document.createElement('div')
  document.body.append(container)
  const app = createApp({
    setup: () => () => h(CardCreationDialog, {
      'ref': dialog,
      'modelValue': open.value,
      'onUpdate:modelValue': (value: boolean) => { open.value = value },
      'cardId': cardId.value,
      'initialTab': 'behavior',
    }),
  })
  app.use(pinia).use(PiniaColada).use(MotionPlugin).use(i18n).use(createRouter({ history: createMemoryHistory(), routes: [] })).mount(container)
  try {
    const cards = useAiriCardStore(pinia)
    cardId.value = await cards.addCard({
      name: 'Discard greeting',
      version: '1.0',
      greetings: ['Original greeting'],
      extensions: { airi: { modules: {} } },
    }, 'scratch')
    open.value = true
    await vi.waitFor(() => expect(Array.from(document.querySelectorAll('input')).some(input => input.value === 'Original greeting')).toBe(true))
    const input = Array.from(document.querySelectorAll('input')).find(input => input.value === 'Original greeting')!
    input.value = 'Changed greeting'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const keepEditing = dialog.value!.requestClose()
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
    expect(await keepEditing).toBe(false)
    expect(open.value).toBe(true)
    expect(input.value).toBe('Changed greeting')
    const discard = dialog.value!.requestClose()
    await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
    expect(await discard).toBe(true)
    await vi.waitFor(() => expect(open.value).toBe(false))
    expect(cards.getCard(cardId.value)?.greetings).toEqual(['Original greeting'])
    open.value = true
    await vi.waitFor(() => expect(Array.from(document.querySelectorAll('input')).some(input => input.value === 'Original greeting')).toBe(true))
  }
  finally {
    app.unmount()
    disposePinia(pinia)
    container.remove()
    localStorage.clear()
  }
})

// Query links must not close an edited card behind the discard confirmation.
it.each(['detail', 'page'])('guards %s navigation with the mounted editor dirty state', async (destination) => {
  localStorage.clear()
  const pinia = createPinia()
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: CardsPage }, { path: '/other', component: { render: () => h('div', 'Other settings') } }] })
  const container = document.createElement('div')
  document.body.append(container)
  const app = createApp({
    setup() {
      useAiriCardStore()
      return () => h(RouterView)
    },
  })
  app.use(pinia).use(PiniaColada).use(MotionPlugin).use(createI18n({ legacy: false, locale: 'en', messages: { en } })).use(router)
  try {
    await router.push('/')
    app.mount(container)
    const cards = useAiriCardStore(pinia)
    const id = await cards.addCard({ name: 'Query guard', version: '1.0', greetings: ['Original route greeting'], extensions: { airi: { modules: {} } } }, 'scratch')
    await router.push({ path: '/', query: { cardId: id, tab: 'behavior' } })
    await vi.waitFor(() => expect(Array.from(document.querySelectorAll('input')).some(input => input.value === 'Original route greeting')).toBe(true))
    const input = Array.from(document.querySelectorAll('input')).find(input => input.value === 'Original route greeting')!
    input.value = 'Unsaved route greeting'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await router.push({ query: { cardId: id, tab: 'gallery' } })
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
    expect(input.isConnected).toBe(true)
    expect(input.value).toBe('Unsaved route greeting')
    await vi.waitFor(() => expect(router.currentRoute.value.query).toEqual({}))
    if (destination === 'page') {
      const rejected = router.push('/other')
      await page.getByRole('button', { name: 'Keep editing', exact: true }).click()
      await rejected
      expect(router.currentRoute.value.path).toBe('/')
      expect(input.isConnected).toBe(true)
      const accepted = router.push('/other')
      await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
      await accepted
      expect(router.currentRoute.value.path).toBe('/other')
    }
    else {
      await router.push({ query: { cardId: id, tab: 'description' } })
      await page.getByRole('button', { name: 'Discard changes', exact: true }).click()
    }
    await vi.waitFor(() => expect(input.isConnected).toBe(false))
    expect(cards.getCard(id)?.greetings).toEqual(['Original route greeting'])
  }
  finally {
    app.unmount()
    disposePinia(pinia)
    container.remove()
    localStorage.clear()
  }
})
