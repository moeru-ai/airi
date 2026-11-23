import type { AiriCard } from '../../stores/modules/airi-card'
import type { ChatSessionMeta } from '../../types/chat-session'

import { PiniaColada } from '@pinia/colada'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import CharacterRail from './character-rail.vue'

import { useChatSessionStore } from '../../stores/chat/session-store'
import { useAiriCardStore } from '../../stores/modules/airi-card'

import 'virtual:uno.css'

function card(name: string): AiriCard {
  return {
    name,
    version: '1.0.0',
    description: '',
    extensions: {
      airi: {
        avatarModels: [],
        modules: {
          consciousness: { provider: '', model: '' },
          vision: { provider: '', model: '' },
          speech: { provider: '', model: '', voice_id: '' },
        },
        agents: {},
      },
    },
  }
}

function session(sessionId: string, characterId: string, updatedAt: number, hidden?: boolean): ChatSessionMeta {
  return { sessionId, characterId, userId: 'local', createdAt: updatedAt, updatedAt, hidden }
}

async function renderRail() {
  const pinia = createPinia()
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: { stage: { 'character-switcher': { title: 'Switch character', manage: 'Manage characters', failed: 'Failed' } } } },
  })
  const screen = await render(CharacterRail, { global: { plugins: [pinia, PiniaColada, i18n] } })
  const cardStore = useAiriCardStore(pinia)
  cardStore.cards = new Map([['first', card('First')], ['second', card('Second')], ['third', card('Third')]])
  cardStore.activeCardId = 'first'
  useChatSessionStore(pinia).sessionMetas = {
    a: session('a', 'first', 1),
    b: session('b', 'second', 5),
    // A background task does not count as a chat with the character.
    c: session('c', 'first', 9, true),
  }
  return { screen, cardStore }
}

describe('character rail', () => {
  it('lists recent characters first and marks the active one', async () => {
    const { screen } = await renderRail()

    await expect.poll(() => Array.from(document.querySelectorAll('[data-testid="character-rail-item"]'), item => item.getAttribute('aria-label')))
      .toEqual(['Second', 'First', 'Third'])
    await expect.element(screen.getByRole('button', { name: 'First' })).toHaveAttribute('aria-pressed', 'true')
    await expect.element(screen.getByRole('button', { name: 'Second' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('activates the selected character and asks the host for character management', async () => {
    const { screen, cardStore } = await renderRail()
    const activateCard = vi.spyOn(cardStore, 'activateCard').mockResolvedValue(true)

    await screen.getByRole('button', { name: 'Second' }).click()
    expect(activateCard).toHaveBeenCalledWith('second')

    await screen.getByRole('button', { name: 'First' }).click()
    expect(activateCard).toHaveBeenCalledTimes(1)

    await screen.getByRole('button', { name: 'Manage characters' }).click()
    expect(screen.emitted('manage')).toHaveLength(1)
  })
})
