import en from '@proj-airi/i18n/locales/en'

import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import ChatPersonaSwitch from './persona-switch.vue'

import { useAiriCardStore } from '../../../../stores/modules/airi-card'

describe('chat persona switch', () => {
  // A persona switch moves the chat to that persona's session. The owner must see who speaks now.
  it('announces the new persona when the active card changes', async () => {
    const pinia = createPinia()
    const screen = await render(ChatPersonaSwitch, {
      global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] },
    })
    expect(screen.container.textContent).toBe('')

    useAiriCardStore(pinia).activeCardId = 'luna'

    await vi.waitFor(() => expect(screen.container.textContent).toContain('Now speaking: luna'))
  })
})
