import en from '@proj-airi/i18n/locales/en'

import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import CardEditor from './CardEditor.vue'

import 'virtual:uno.css'

function deleteCardDatabase() {
  return new Promise<void>((resolve, reject) => {
    const deleting = indexedDB.deleteDatabase('airi-character-cards')
    deleting.onsuccess = () => resolve()
    deleting.onerror = () => reject(deleting.error)
    deleting.onblocked = () => reject(new Error('Character card database remained open'))
  })
}

describe('character card editor concurrent updates', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(async () => {
    localStorage.clear()
    await deleteCardDatabase()
    pinia = createPinia()
  })

  afterEach(async () => {
    cleanup()
    disposePinia(pinia)
    localStorage.clear()
    await deleteCardDatabase()
  })

  it('keeps a concurrently synchronized field across consecutive saves', async () => {
    const screen = await render(CardEditor, {
      props: { cardId: 'placeholder' },
      global: {
        plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })
    const cards = useAiriCardStore(pinia)
    const cardId = await cards.addCard({ name: 'Luna', version: '1.0.0', description: 'Original', notes: 'Notes' }, 'scratch')
    await screen.rerender({ cardId })
    await expect.element(screen.getByLabelText('Description')).toHaveValue('Original')

    await cards.updateCard(cardId, { description: 'Synchronized while editing' })
    await screen.getByRole('textbox', { name: /^Name \*/ }).fill('Nova')
    await screen.getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => cards.getCard(cardId)?.name).toBe('Nova')
    expect(cards.getCard(cardId)?.description).toBe('Synchronized while editing')

    await screen.getByLabelText('Nickname').fill('Nova')
    await screen.getByRole('button', { name: 'Save changes' }).click()

    await expect.poll(() => cards.getCard(cardId)?.nickname).toBe('Nova')
    expect(cards.getCard(cardId)).toMatchObject({
      name: 'Nova',
      description: 'Synchronized while editing',
      nickname: 'Nova',
    })
  })
})
