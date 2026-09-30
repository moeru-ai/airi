import en from '@proj-airi/i18n/locales/en'

import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import ChatHistory from './history.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

describe('chat history width', () => {
  // Report: user screenshot of the floating chat on 2026-09-30.
  // ROOT CAUSE:
  // The action wrapper kept its content minimum width and expanded beyond the viewport.
  // Constrain that wrapper so wide code scrolls inside the bubble.
  it.each([
    ['desktop', 'assistant'],
    ['desktop', 'user'],
    ['mobile', 'assistant'],
    ['mobile', 'user'],
  ] as const)('keeps long code inside a %s %s bubble', async (variant, role) => {
    const content = `这里主要是两类问题。\n\n\`\`\`text\n${'settings.pages.providers.provider.perplexity.description '.repeat(8)}\n\`\`\`\n\n${'说明内容。'.repeat(100)}`
    const screen = await render(ChatHistory, {
      props: {
        variant,
        surface: 'opaque',
        messages: [role === 'assistant'
          ? { id: 'long-answer', role, content, slices: [{ type: 'text', text: content }], tool_results: [] }
          : { id: 'long-question', role, content }],
        style: 'height: 400px; width: 360px',
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })
    await expect.poll(() => screen.container.querySelector('pre')).not.toBeNull()
    const viewport = screen.container.querySelector<HTMLElement>('.chat-history-list')!
    const bubble = screen.container.querySelector<HTMLElement>('.chat-message-item-container')!
    const code = screen.container.querySelector<HTMLElement>('pre')!

    await expect.poll(() => viewport.scrollWidth).toBe(viewport.clientWidth)
    expect(bubble.getBoundingClientRect().left).toBeGreaterThanOrEqual(viewport.getBoundingClientRect().left)
    expect(bubble.getBoundingClientRect().right).toBeLessThanOrEqual(viewport.getBoundingClientRect().right)
    expect(code.scrollWidth).toBeGreaterThan(code.clientWidth)
    code.scrollLeft = 80
    expect(code.scrollLeft).toBe(80)
    viewport.scrollTop = 40
    expect(viewport.scrollTop).toBe(40)
  })

  it.each(['assistant', 'user'] as const)('keeps a short %s bubble fitted to its content', async (role) => {
    const content = 'Hello'
    const screen = await render(ChatHistory, {
      props: {
        messages: [role === 'assistant'
          ? { id: 'short-answer', role, content, slices: [{ type: 'text', text: content }], tool_results: [] }
          : { id: 'short-question', role, content }],
        style: 'height: 400px; width: 360px',
      },
      global: {
        plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })
    await expect.poll(() => screen.container.querySelector('.chat-message-item-container')).not.toBeNull()
    const bubble = screen.container.querySelector<HTMLElement>('.chat-message-item-container')!
    expect(bubble.getBoundingClientRect().width).toBeLessThan(180)
    expect(bubble.textContent).toContain(content)
  })
})
