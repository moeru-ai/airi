import type { ChatHistoryItem } from '../../../../types/chat'

import en from '@proj-airi/i18n/locales/en'

import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import ChatHistory from './history.vue'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

const longUrl = 'https://example.com/a/very/long/path/that/does/not/break/anywhere/because/it/is/one/token'
const longCode = '```\nconst lastSeen = new Date(\'2026-09-24T12:00:00Z\'); const now = new Date(\'2026-09-29T12:50:00Z\')\n```'

describe('chat history layout', () => {
  it('keeps every bubble inside a narrow history when a message holds a long token', async () => {
    // ROOT CAUSE:
    //
    // A fit-content bubble never shrinks below its longest unbreakable token.
    // A long URL or code line, even in folded reasoning, made it wider than
    // the history, which cut off every line.
    //
    // The bubble now stays within the history width.
    const text = `Oh! It's you. ${longUrl}`
    const messages: ChatHistoryItem[] = [
      { id: 'user-1', role: 'user', content: longUrl },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: text,
        slices: [{ type: 'text', text: `${text}\n\n${longCode}` }],
        tool_results: [],
        categorization: { speech: text, reasoning: `Five days since ${longUrl}` },
      },
    ]
    const screen = await render(ChatHistory, {
      props: { messages, style: 'height: 600px; width: 300px;' },
      global: { plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })] },
    })
    onTestFinished(() => screen.unmount())

    const history = screen.container.firstElementChild as HTMLElement
    await vi.waitFor(() => expect(screen.container.querySelectorAll('.chat-message-item-container')).toHaveLength(2))
    for (const bubble of screen.container.querySelectorAll<HTMLElement>('.chat-message-item-container'))
      expect(bubble.getBoundingClientRect().right).toBeLessThanOrEqual(history.getBoundingClientRect().right)
  })
})
