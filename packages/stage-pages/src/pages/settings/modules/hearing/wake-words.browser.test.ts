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

import WakeWordsPage from './wake-words.vue'

import 'virtual:uno.css'

/** Both cards use this pronunciation, so the device must choose who answers it. */
const SHARED = ['HH', 'EY1', 'EY1', 'R', 'IY0']
/** Only Luna uses this pronunciation, so it stays active for her. */
const LUNA_ONLY = ['L', 'UW1', 'N', 'AH0']
/** The store validates tokens against the model vocabulary. The test model accepts exactly the tokens above. */
const model = { id: kwsModel.id, vocabulary: new Set([...SHARED, ...LUNA_ONLY]) }

const pinias: ReturnType<typeof createPinia>[] = []

afterEach(() => {
  cleanup()
  pinias.splice(0).forEach(pinia => disposePinia(pinia))
  localStorage.clear()
})

/**
 * Renders the page, then adds two characters that share {@link SHARED}.
 * The card store reads i18n at setup, so the stores start after a component with the i18n plugin mounts.
 */
async function renderWithConflict() {
  const pinia = createPinia()
  pinias.push(pinia)
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:path(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/settings/modules/hearing/wake-words')
  const screen = await render(WakeWordsPage, {
    global: {
      plugins: [pinia, router, createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: false, fallbackWarn: false })],
    },
  })

  const cards = useAiriCardStore(pinia)
  const wakeWords = useWakeWordsStore(pinia)
  const aria = await cards.addCard({ name: 'Aria', version: '1.0.0' }, 'scratch')
  const luna = await cards.addCard({ name: 'Luna', version: '1.0.0' }, 'scratch')
  await wakeWords.setWords(aria, [{ text: 'Hey AIRI', modelId: kwsModel.id, pronunciations: [SHARED] }], model)
  await wakeWords.setWords(luna, [{ text: 'Hey AIRI', modelId: kwsModel.id, pronunciations: [SHARED] }, { text: 'Luna', modelId: kwsModel.id, pronunciations: [LUNA_ONLY] }], model)

  return { screen, wakeWords, aria, luna }
}

/** Finds the row of one pronunciation on one character's card. Its `data-state` tells how the device treats it. */
function pronunciationOf(characterId: string, tokens: string[]) {
  const character = document.querySelector(`[data-testid="wake-word-character"][data-character-id="${characterId}"]`)
  const rows = [...character?.querySelectorAll<HTMLElement>('[data-testid="wake-word-pronunciation"]') ?? []]
  return rows.find(row => row.textContent?.includes(tokens.join(' ')))
}

describe('wake words settings', () => {
  it('pauses a shared pronunciation for both characters until the user chooses who answers', async () => {
    const { screen, aria, luna } = await renderWithConflict()

    await expect.element(screen.getByTestId('wake-word-conflict')).toHaveAttribute('data-resolved', 'false')
    await expect.element(screen.getByTestId('wake-word-conflict')).toHaveTextContent('No character answers this pronunciation.')
    await expect.poll(() => pronunciationOf(aria, SHARED)?.dataset.state).toBe('paused')
    expect(pronunciationOf(luna, SHARED)?.dataset.state).toBe('paused')
    expect(pronunciationOf(luna, LUNA_ONLY)?.dataset.state).toBe('active')
  })

  it('activates the chosen character for the shared pronunciation', async () => {
    const { screen, wakeWords, aria, luna } = await renderWithConflict()

    await screen.getByTestId(`wake-word-owner-${aria}`).click()

    await expect.element(screen.getByTestId('wake-word-conflict')).toHaveAttribute('data-resolved', 'true')
    await expect.element(screen.getByTestId('wake-word-conflict')).toHaveTextContent('Aria answers')
    await expect.element(screen.getByTestId(`wake-word-owner-${aria}`)).toHaveAttribute('aria-pressed', 'true')
    expect(pronunciationOf(aria, SHARED)?.dataset.state).toBe('active')
    expect(pronunciationOf(luna, SHARED)?.dataset.state).toBe('other')
    expect(pronunciationOf(luna, SHARED)?.textContent).toContain('Answered by Aria')

    const key = wakeWordKey(kwsModel.id, SHARED)
    expect(wakeWords.catalog.active.filter(pronunciation => pronunciation.key === key).map(pronunciation => pronunciation.characterId)).toEqual([aria])
  })

  it('lets the user move a shared pronunciation to another character', async () => {
    const { screen, wakeWords, aria, luna } = await renderWithConflict()

    await screen.getByTestId(`wake-word-owner-${aria}`).click()
    await screen.getByTestId(`wake-word-owner-${luna}`).click()

    await expect.element(screen.getByTestId('wake-word-conflict')).toHaveTextContent('Luna answers')
    expect(pronunciationOf(aria, SHARED)?.dataset.state).toBe('other')
    expect(pronunciationOf(luna, SHARED)?.dataset.state).toBe('active')
    expect(wakeWords.catalog.conflicts[0]?.owner).toBe(luna)
  })
})
