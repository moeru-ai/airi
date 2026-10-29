import en from '@proj-airi/i18n/locales/en'

import { kwsModel } from '@proj-airi/stage-ui/libs/voice/kws-model-info'
import { wakeWordKey } from '@proj-airi/stage-ui/libs/voice/wake-words'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useWakeWordsStore } from '@proj-airi/stage-ui/stores/wake-words'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import WakeWordConflictAlert from './wake-word-conflict-alert.vue'

import 'virtual:uno.css'

const SHARED = ['HH', 'EY1', 'EY1', 'R', 'IY0']
const model = { id: kwsModel.id, vocabulary: new Set(SHARED) }

let pinia: ReturnType<typeof createPinia>

afterEach(() => {
  cleanup()
  disposePinia(pinia)
  localStorage.clear()
})

describe('character cards wake word alert', () => {
  it('links to the wake words page until each shared pronunciation has a character', async () => {
    pinia = createPinia()
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:path(.*)*', component: { template: '<div />' } }],
    })
    await router.push('/settings/airi-card')
    // The card store reads i18n at setup, so the stores start after the component with the i18n plugin mounts.
    const screen = await render(WakeWordConflictAlert, {
      global: { plugins: [pinia, router, createI18n({ legacy: false, locale: 'en', messages: { en } })] },
    })
    const cards = useAiriCardStore(pinia)
    const wakeWords = useWakeWordsStore(pinia)
    const aria = await cards.addCard({ name: 'Aria', version: '1.0.0' }, 'scratch')
    const luna = await cards.addCard({ name: 'Luna', version: '1.0.0' }, 'scratch')
    await wakeWords.setWords(aria, [{ text: 'Hey AIRI', modelId: kwsModel.id, pronunciations: [SHARED] }], model)
    await wakeWords.setWords(luna, [{ text: 'Hey AIRI', modelId: kwsModel.id, pronunciations: [SHARED] }], model)

    await expect.element(screen.getByTestId('wake-word-conflict-alert')).toHaveTextContent('One shared wake word pronunciation needs a character')
    await expect.element(screen.getByTestId('wake-word-conflict-alert')).toHaveAttribute('data-tone', 'warning')
    await expect.element(screen.getByRole('link', { name: 'Choose who answers' })).toHaveAttribute('href', '/settings/modules/hearing/wake-words')

    wakeWords.chooseOwner(wakeWordKey(kwsModel.id, SHARED), aria)

    await expect.element(screen.getByTestId('wake-word-conflict-alert')).not.toBeInTheDocument()
  })
})
