import en from '@proj-airi/i18n/locales/en'

import { CHARACTER_CARD_SYNC_FLAG } from '@proj-airi/stage-ui/libs/feature-flags'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useFeatureFlagsStore } from '@proj-airi/stage-ui/stores/feature-flags'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { defineComponent, h, ref } from 'vue'
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

  beforeEach(() => {
    localStorage.clear()
    pinia = createPinia()
  })

  afterEach(() => {
    cleanup()
    disposePinia(pinia)
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  // The store calls `useI18n()` at its own setup, so the first call to
  // `useAiriCardStore` must happen while a component with the i18n plugin is
  // mounted. Mounting the dialog on a placeholder id before the card exists
  // gives the store that context, and `rerender` then points it at the card.
  async function renderDialog() {
    // The test iframe defaults to a narrow width, which selects the mobile
    // BottomDrawer branch. The desktop Dialog branch keeps the restore dialog
    // clickable with a static modelValue, so pin a desktop viewport.
    await page.viewport(1280, 720)
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

  it('does not offer a history tab for a user who is not signed in', async () => {
    const { screen } = await renderDialog()

    expect(screen.getByText('History').elements()).toHaveLength(0)
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
    await screen.getByRole('button', { name: 'History' }).click()

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

  it('does not offer a history tab for a signed-in user who has not turned cloud sync on', async () => {
    const { screen, cardId } = await renderDialog()

    signIn(useAuthStore(pinia))
    await screen.rerender({ cardId })

    expect(screen.getByText('History').elements()).toHaveLength(0)
  })

  it('restores a version from the mobile drawer and reopens it on the history tab', async () => {
    // The mobile branch renders the detail in a BottomDrawer. The restore
    // dialog cannot stack above the drawer, so the drawer closes before the
    // dialog opens and reopens once the restore settles.
    await page.viewport(375, 720)

    const dialogOpen = ref(true)
    const dialogCardId = ref('placeholder')
    const screen = await render(defineComponent(() => {
      return () => h(CardDetailDialog, {
        'modelValue': dialogOpen.value,
        'onUpdate:modelValue': (value: boolean) => {
          dialogOpen.value = value
        },
        'cardId': dialogCardId.value,
        'initialTab': 'history',
      })
    }), {
      global: {
        plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })
    const cardId = await useAiriCardStore(pinia).addCard({ name: 'Luna', version: '1.0.0' }, 'scratch')
    dialogCardId.value = cardId

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

      return new Response(null, { status: 404 })
    })

    await screen.getByRole('button', { name: 'History' }).click()
    await expect.element(screen.getByText('Current')).toBeVisible()

    await screen.getByRole('button', { name: 'Restore this version' }).click()
    await expect.element(screen.getByText('Restore this version?')).toBeVisible()
    await screen.getByRole('button', { name: 'Restore', exact: true }).click()

    await expect.poll(() => useAiriCardStore(pinia).cards.get(cardId)?.name).toBe('Nova')
    // The drawer reopens on the history tab, which loads the entries again.
    await expect.element(screen.getByText('Current')).toBeVisible()
  })
})
