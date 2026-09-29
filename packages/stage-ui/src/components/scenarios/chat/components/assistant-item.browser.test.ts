import type { ChatAssistantMessage } from '../../../../types/chat'

import { createPinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import AssistantItem from './assistant-item.vue'

function renderMessage(stickerId: string) {
  const message: ChatAssistantMessage = {
    role: 'assistant',
    content: 'Hello!',
    tool_results: [],
    slices: [{ type: 'text', text: 'Hello!' }, { type: 'sticker', stickerId }],
  }
  return render(AssistantItem, {
    props: { label: 'AIRI', message: structuredClone(message) },
    global: { plugins: [createPinia(), createI18n({ legacy: false, locale: 'en', messages: {
      en: { stage: { chat: { actions: { retry: 'Retry', reply: 'Reply' } } }, settings: { pages: { modules: { stickers: { unavailable: 'Sticker unavailable', artwork: { heart: 'Red heart' } } } } } },
    } })] },
  })
}

describe('assistant stickers', () => {
  it('renders a saved sticker as a local image beside the reply text', async () => {
    const view = renderMessage('heart')
    await expect.element(view.getByRole('img', { name: 'Red heart' })).toBeVisible()
    await expect.poll(() => view.container.querySelector('img')?.naturalWidth).toBeGreaterThan(0)
    await expect.element(view.getByText('Hello!', { exact: true })).toBeVisible()
  })

  it('shows a placeholder for an unknown saved ID without requesting its URL', async () => {
    const view = renderMessage('https://example.com/untrusted.png')
    await expect.element(view.getByText('Sticker unavailable')).toBeVisible()
    expect(view.container.querySelector('img')).toBeNull()
  })
})
