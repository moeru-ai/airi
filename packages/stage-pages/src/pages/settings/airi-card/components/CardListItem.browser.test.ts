import en from '@proj-airi/i18n/locales/en'

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import CardListItem from './CardListItem.vue'

import 'virtual:uno.css'

const props = {
  id: 'card',
  name: 'Luna',
  description: 'Calm',
  isActive: false,
  isSelected: false,
  version: '1.0.0',
  consciousnessModel: 'default',
  voiceModel: 'default',
}

function renderItem(syncState?: 'synced' | 'pending' | 'refused') {
  return render(CardListItem, {
    props: { ...props, syncState },
    global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
}

describe('card list item cloud state', () => {
  afterEach(() => cleanup())

  it.each([
    ['synced', 'Synced to your account'],
    ['pending', 'Waiting to upload'],
    ['refused', 'Not uploaded. Your account has no room for more cards, so this card stays on this device.'],
  ] as const)('shows the %s state with its text', async (state, text) => {
    const screen = await renderItem(state)

    const icon = screen.container.querySelector(`[data-sync-state="${state}"]`)
    expect(icon).not.toBeNull()
    expect(icon?.getAttribute('title')).toBe(text)
  })

  // Without an account nothing leaves the device, so the card shows no cloud state.
  it('shows no cloud state when the user is not signed in', async () => {
    const screen = await renderItem()

    expect(screen.container.querySelector('[data-sync-state]')).toBeNull()
  })
})
