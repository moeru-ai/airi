import type { AiriCard } from '../../stores/modules/airi-card'

import { PiniaColada } from '@pinia/colada'
import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import CharacterRail from './character-rail.vue'

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

async function renderRail(props: { variant?: 'floating' | 'docked' | 'island', selected?: string } = {}) {
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
  return { screen, cardStore }
}

describe('character rail', () => {
  it('keeps the card order and marks the character on the stage', async () => {
    const { screen } = await renderRail()

    await expect.poll(() => Array.from(document.querySelectorAll('[data-testid="character-rail-item"]'), item => item.getAttribute('aria-label')))
      .toEqual(['First', 'Second · on stage', 'Third'])
    await expect.element(screen.getByRole('button', { name: 'Second · on stage' })).toHaveAttribute('aria-pressed', 'true')
    await expect.element(screen.getByRole('button', { name: 'First' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('marks the picked character apart from the character on the stage', async () => {
    const { screen } = await renderRail({ variant: 'docked', selected: 'third' })

    await expect.element(screen.getByRole('button', { name: 'Third' })).toHaveAttribute('aria-pressed', 'true')
    await expect.element(screen.getByRole('button', { name: 'Second · on stage' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('tells the host which character the user picked and when the user asks for character management', async () => {
    const { screen, cardStore } = await renderRail()

    await screen.getByRole('button', { name: 'Third' }).click()
    expect(screen.emitted('select')).toEqual([['third']])
    // The pick alone keeps the character on the stage. The host decides what the pick does.
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
