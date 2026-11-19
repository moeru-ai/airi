import en from '@proj-airi/i18n/locales/en'

import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useBackgroundStore } from '@proj-airi/stage-ui/stores/background'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useSyncPreferencesStore } from '@proj-airi/stage-ui/stores/sync-preferences'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import CardDetail from './card-detail.vue'

import 'virtual:uno.css'

function signIn(auth: ReturnType<typeof useAuthStore>) {
  const user = { id: 'alice', name: 'Alice', email: 'alice@example.com', emailVerified: true, createdAt: new Date(0), updatedAt: new Date(0) }
  const session = { id: 'session-alice', userId: 'alice', token: 'test-token', expiresAt: new Date('2099-01-01'), createdAt: new Date(0), updatedAt: new Date(0) }
  auth.$patch({ user, session })
}

describe('card detail history', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
    // A signed-in user starts background requests. A real server can answer
    // after the test ends, and a 401 then runs auth actions on a disposed Pinia.
    vi.stubGlobal('fetch', async () => new Response(null, { status: 404 }))
  })

  afterEach(() => {
    cleanup()
    disposePinia(pinia)
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  // The store calls `useI18n()` at its own setup, so the first call to
  // `useAiriCardStore` must happen while a component with the i18n plugin is
  // mounted. Mounting the detail on a placeholder id before the card exists
  // gives the store that context, and `rerender` then points it at the card.
  async function renderDetail() {
    const screen = await render(CardDetail, {
      props: { cardId: 'placeholder', initialTab: 'history' },
      global: {
        plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })
    const cardId = await useAiriCardStore(pinia).addCard({ name: 'Luna', version: '1.0.0' }, 'scratch')
    await screen.rerender({ cardId })
    // The detail loads the display models on mount. The test must not end before it.
    await expect.poll(() => useDisplayModelsStore(pinia).displayModels.length).toBeGreaterThan(0)
    return { screen, cardId }
  }

  it('does not offer history for a user who is not signed in', async () => {
    const { screen } = await renderDetail()

    expect(screen.getByText('History').elements()).toHaveLength(0)
  })

  it('shows the past revisions of a card and restores one', async () => {
    const { screen, cardId } = await renderDetail()
    signIn(useAuthStore(pinia))
    useSyncPreferencesStore(pinia).setEnabled('character-cards', true)
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
      // Flux balance and card asset preloading. The history section does not
      // depend on them, so a generic empty response keeps the test focused.
      return new Response(null, { status: 404 })
    })
    await screen.rerender({ cardId })

    await expect.element(screen.getByText('Current')).toBeVisible()
    await expect.element(screen.getByText('Changed').first()).toBeVisible()
    await expect.element(screen.getByText('Name').first()).toBeVisible()

    await screen.getByRole('button', { name: 'Restore this version' }).click()
    await expect.element(screen.getByText('Restore this version?')).toBeVisible()
    await screen.getByRole('button', { name: 'Restore', exact: true }).click()

    await expect.poll(() => useAiriCardStore(pinia).cards.get(cardId)?.name).toBe('Nova')
    // The restore then reloads the history. Its button stays disabled until the reload ends.
    await expect.element(screen.getByRole('button', { name: 'Restore this version' })).toBeEnabled()
  })

  it('does not offer history for a signed-in user who turned cloud sync off', async () => {
    const { screen, cardId } = await renderDetail()

    useSyncPreferencesStore(pinia).setEnabled('character-cards', false)
    signIn(useAuthStore(pinia))
    await screen.rerender({ cardId })

    expect(screen.getByText('History').elements()).toHaveLength(0)
  })

  it('pins a background to the card', async () => {
    const { screen, cardId } = await renderDetail()
    const backgroundStore = useBackgroundStore(pinia)
    const backgroundId = 'bg-test'
    await expect.poll(() => backgroundStore.loading).toBe(false)
    backgroundStore.entries = new Map([[backgroundId, {
      id: backgroundId,
      type: 'journal',
      characterId: cardId,
      title: 'Test image',
      blob: new Blob(['image'], { type: 'image/png' }),
      createdAt: 0,
    }]])
    await screen.rerender({ cardId })

    await expect.element(screen.getByRole('img', { name: 'Test image' })).toBeVisible()
    await screen.getByRole('button', { name: 'Set as background' }).click()

    await expect.poll(() => useAiriCardStore(pinia).cards.get(cardId)?.extensions.airi.modules.activeBackgroundId).toBe(backgroundId)
    backgroundStore.entries = new Map()
  })
})
