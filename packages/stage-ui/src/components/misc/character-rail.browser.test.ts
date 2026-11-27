import type { AiriCard } from '../../stores/modules/airi-card'
import type { ChatSessionMeta } from '../../types/chat-session'

import { PiniaColada } from '@pinia/colada'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
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

async function renderRail(props: { variant?: 'floating' | 'docked' | 'island' } = {}) {
  const pinia = createPinia()
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: { stage: { 'character-switcher': { 'title': 'Switch character', 'manage': 'Manage characters', 'on-stage': '{name} · on stage' } } } },
  })
  const screen = await render(CharacterRail, { props, global: { plugins: [pinia, PiniaColada, i18n] } })
  const cardStore = useAiriCardStore(pinia)
  cardStore.cards = new Map([['first', card('First')], ['second', card('Second')], ['third', card('Third')]])
  cardStore.activeCardId = 'second'
  useChatSessionStore(pinia).sessionMetas = {
    a: session('a', 'first', 1),
    b: session('b', 'second', 5),
    // A background task does not count as a chat with the character.
    c: session('c', 'first', 9, true),
  }
  return { screen, cardStore }
}

describe('character rail', () => {
  it('lists recent characters first and marks the character on the stage', async () => {
    const { screen } = await renderRail()

    await expect.poll(() => Array.from(document.querySelectorAll('[data-testid="character-rail-item"]'), item => item.getAttribute('aria-label')))
      .toEqual(['Second · on stage', 'First', 'Third'])
    await expect.element(screen.getByRole('button', { name: 'Second · on stage' })).toHaveAttribute('aria-pressed', 'true')
    await expect.element(screen.getByRole('button', { name: 'First' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('tells the host which character the user picked and when the user asks for character management', async () => {
    const { screen, cardStore } = await renderRail()

    await screen.getByRole('button', { name: 'Third' }).click()
    expect(screen.emitted('select')).toEqual([['third']])
    // The rail only tells the host. The host activates the character.
    expect(cardStore.activeCardId).toBe('second')

    await screen.getByRole('button', { name: 'Manage characters' }).click()
    expect(screen.emitted('manage')).toHaveLength(1)
  })

  it('stays a column of avatars without names when docked in a window', async () => {
    const { screen } = await renderRail({ variant: 'docked' })
    const rail = screen.getByTestId('character-rail')

    await rail.hover()
    await expect.poll(() => rail.element().getAttribute('data-open')).toBe('false')
    await expect.element(screen.getByRole('button', { name: 'Third' })).toBeVisible()
    // The avatars keep their initials. The names are not rendered.
    expect(Array.from(rail.element().querySelectorAll('span'), span => span.textContent?.trim())).not.toContain('Third')
  })
})
