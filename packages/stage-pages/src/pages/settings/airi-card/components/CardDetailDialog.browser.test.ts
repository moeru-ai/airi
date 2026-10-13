import en from '@proj-airi/i18n/locales/en'

import { CHARACTER_CARD_SYNC_FLAG } from '@proj-airi/stage-ui/libs/feature-flags'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useFeatureFlagsStore } from '@proj-airi/stage-ui/stores/feature-flags'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import CardDetailDialog from './CardDetailDialog.vue'

import 'virtual:uno.css'

function signIn(auth: ReturnType<typeof useAuthStore>) {
  const user = { id: 'alice', name: 'Alice', email: 'alice@example.com', emailVerified: true, createdAt: new Date(0), updatedAt: new Date(0) }
  const session = { id: 'session-alice', userId: 'alice', token: 'test-token', expiresAt: new Date('2099-01-01'), createdAt: new Date(0), updatedAt: new Date(0) }
  auth.$patch({ user, session })
}

describe('card detail dialog history tab', () => {
  let pinia: ReturnType<typeof createPinia>

  function clearCardDatabase() {
    return new Promise<void>((resolve, reject) => {
      const opening = indexedDB.open('airi-character-cards', 1)
      opening.onupgradeneeded = () => {
        const db = opening.result
        db.createObjectStore('character-card-documents', { keyPath: 'cardId' })
        const revisions = db.createObjectStore('character-card-field-revisions', { keyPath: ['cardId', 'key', 'localRevision'] })
        revisions.createIndex('cardId', 'cardId')
        revisions.createIndex('cardRevision', ['cardId', 'localRevision'])
        db.createObjectStore('metadata')
      }
      opening.onerror = () => reject(opening.error)
      opening.onsuccess = () => {
        const db = opening.result
        const transaction = db.transaction(['character-card-documents', 'character-card-field-revisions', 'metadata'], 'readwrite')
        for (const name of ['character-card-documents', 'character-card-field-revisions', 'metadata'])
          transaction.objectStore(name).clear()
        transaction.oncomplete = () => {
          db.close()
          resolve()
        }
        transaction.onerror = () => reject(transaction.error)
      }
    })
  }

  beforeEach(async () => {
    localStorage.clear()
    await clearCardDatabase()
    pinia = createPinia()
  })

  afterEach(async () => {
    cleanup()
    disposePinia(pinia)
    vi.unstubAllGlobals()
    localStorage.clear()
    await clearCardDatabase()
  })

  // The store calls `useI18n()` at its own setup, so the first call to
  // `useAiriCardStore` must happen while a component with the i18n plugin is
  // mounted. Mounting the dialog on a placeholder id before the card exists
  // gives the store that context, and `rerender` then points it at the card.
  async function renderDialog() {
    const screen = await render(CardDetailDialog, {
      props: { modelValue: true, cardId: 'placeholder', initialTab: 'history' },
      global: {
        plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })
    const cardId = await useAiriCardStore(pinia).addCard({ name: 'Luna', version: '1.0.0' }, 'scratch')
    await screen.rerender({ cardId })
    return { screen, cardId }
  }

  // https://github.com/moeru-ai/airi/issues/2839
  // ROOT CAUSE:
  //
  // The card store persists only the latest local snapshot, and the History tab reads cloud revisions.
  // The cloud-only gate hides the only history view from a signed-out user.
  it('shows local history to a user who is not signed in', async () => {
    const { screen, cardId } = await renderDialog()
    const cards = useAiriCardStore(pinia)
    await cards.updateCard(cardId, { name: 'Nova' })
    await screen.rerender({ cardId })

    expect(screen.getByRole('button', { name: 'History' }).elements()).toHaveLength(1)
    await screen.getByRole('button', { name: 'Modules' }).click()
    await screen.getByRole('button', { name: 'History' }).click()
    await expect.element(screen.getByText('Current')).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Restore this version' })).toBeVisible()
    await screen.getByRole('button', { name: 'Restore this version' }).click()
    await screen.getByRole('button', { name: 'Restore', exact: true }).click()
    await expect.poll(() => cards.cards.get(cardId)?.name).toBe('Luna')
  })

  it('shows the past revisions of a card and restores one', async () => {
    const { screen, cardId } = await renderDialog()
    signIn(useAuthStore(pinia))
    useFeatureFlagsStore(pinia).setPreference(CHARACTER_CARD_SYNC_FLAG.key, true)
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes(`/${encodeURIComponent(cardId)}/history/1`)) {
        return Response.json({ revision: 1, at: '2026-01-01T00:00:00.000Z', fields: [{ key: '/name', value: 'Nova' }, { key: '/version', value: '1.0.0' }] })
      }
      if (url.includes(`/${encodeURIComponent(cardId)}/history`)) {
        return Response.json({
          history: [{ revision: 2, at: '2026-01-02T00:00:00.000Z', changed: ['/name'], removed: [] }, { revision: 1, at: '2026-01-01T00:00:00.000Z', changed: ['/name'], removed: [] }],
        })
      }
      if (url.includes('/api/v1/character-cards'))
        return Response.json({ documents: [] })

      // The signed-in app also runs unrelated background requests, such as the
      // Flux balance and card asset preloading. The history tab does not
      // depend on them, so a generic empty response keeps the test focused.
      return new Response(null, { status: 404 })
    })
    // Signing in changes the available tabs. Force the dialog to read them again.
    await screen.rerender({ cardId })
    await screen.getByRole('button', { name: 'Cloud history' }).click()

    // The newest entry is the current content, so it carries a badge and no restore button.
    await expect.element(screen.getByText('Current')).toBeVisible()
    await expect.element(screen.getByText('Changed').first()).toBeVisible()
    await expect.element(screen.getByText('Name').first()).toBeVisible()

    // Only the older revision offers a restore, and it asks through a dialog.
    await screen.getByRole('button', { name: 'Restore this version' }).click()
    await expect.element(screen.getByText('Restore this version?')).toBeVisible()
    await screen.getByRole('button', { name: 'Restore', exact: true }).click()

    await expect.poll(() => useAiriCardStore(pinia).cards.get(cardId)?.name).toBe('Nova')
  })

  it('keeps local history when a signed-in user has not turned cloud sync on', async () => {
    const { screen, cardId } = await renderDialog()

    signIn(useAuthStore(pinia))
    await screen.rerender({ cardId })

    expect(screen.getByRole('button', { name: 'History' }).elements()).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Cloud history' }).elements()).toHaveLength(0)
  })
})
