import type { ChatHistoryItem } from '../../../../types/chat'

import en from '@proj-airi/i18n/locales/en'

import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import ChatHistory from './history.vue'

import { getChatHistoryItemKey } from '../utils'

function createEnglishI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: { en },
  })
}

describe('chat history', () => {
  // ROOT CAUSE:
  //
  // Rendering every message keeps every backdrop-filter surface alive, even when
  // most of the history is outside the viewport. Long histories then cost more to
  // lay out and composite during fast mobile scrolling.
  //
  // We virtualize the history and mount only the viewport plus a small overscan area.
  it('virtualizes long histories and reveals messages inside the viewport', async () => {
    const messages: ChatHistoryItem[] = Array.from({ length: 100 }, (_, index) => ({
      id: `user-${index}`,
      role: 'user',
      content: `Message ${index} `.repeat(index % 6 + 1),
      createdAt: index,
    }))

    const screen = await render(ChatHistory, {
      props: {
        messages,
        variant: 'mobile',
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      const renderedMessages = screen.container.querySelectorAll('.chat-message-item')
      expect(renderedMessages.length).toBeGreaterThan(0)
      expect(renderedMessages.length).toBeLessThan(messages.length)
      expect(screen.container.textContent).toContain('Message 99')
    })

    await vi.waitFor(() => {
      const visibleMessages = screen.container.querySelectorAll('.chat-message-item-visible')
      const hiddenMessages = screen.container.querySelectorAll('.chat-message-item:not(.chat-message-item-visible)')

      expect(visibleMessages.length).toBeGreaterThan(0)
      expect(hiddenMessages.length).toBeGreaterThan(0)
      expect(visibleMessages[0].classList.contains('opacity-100')).toBe(true)
      expect(visibleMessages[0].classList.contains('transition-opacity')).toBe(true)
      expect(hiddenMessages[0].classList.contains('opacity-0')).toBe(true)
    })

    const history = screen.container.querySelector<HTMLElement>('.chat-history-list')
    expect(history).not.toBeNull()
    if (!history)
      throw new Error('Expected a chat history viewport.')

    history.scrollTop = 0
    history.dispatchEvent(new Event('scroll'))

    await vi.waitFor(() => {
      expect(screen.container.textContent).toContain('Message 0')
    })
  })

  it('keeps a stable mask on each mobile message container', async () => {
    const screen = await render(ChatHistory, {
      props: {
        messages: [{ role: 'user', content: 'hello' }],
        variant: 'mobile',
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(screen.container.querySelector('.chat-message-item-container')).not.toBeNull()
    })

    const messageContainer = screen.container.querySelector<HTMLElement>('.chat-message-item-container')
    expect(messageContainer).not.toBeNull()
    if (!messageContainer)
      throw new Error('Expected a mobile chat message container.')

    expect(getComputedStyle(messageContainer).maskImage).not.toBe('none')
    await vi.waitFor(() => {
      expect(messageContainer.closest('.chat-message-item-visible')).not.toBeNull()
    })
  })

  // ROOT CAUSE:
  //
  // Cross-window synchronization can publish `sending` before it publishes the new stream.
  // The initial stream object has a timestamp but no message id, which rendered a short-lived bubble.
  //
  // We fixed this by rendering only a stream that has the stable id assigned to the assistant turn.
  it('does not render the initial empty stream while a synchronized send starts', async () => {
    const screen = await render(ChatHistory, {
      props: {
        messages: [],
        sending: true,
        streamingMessage: {
          role: 'assistant',
          content: '',
          slices: [],
          tool_results: [],
          createdAt: 1710000000000,
        },
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    expect(screen.container.querySelectorAll('.chat-message-item')).toHaveLength(0)
  })

  it('emits retry-message when the retry button is clicked for an error after a user message', async () => {
    const messages: ChatHistoryItem[] = [
      { role: 'user', content: 'hello' },
      { role: 'error', content: 'Remote sent 400 response' },
    ]

    const screen = await render(ChatHistory, {
      props: {
        messages,
        style: 'height: 480px; width: 480px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await screen.getByRole('button', { name: 'Retry' }).click()

    expect(screen.emitted('retryMessage')).toEqual([[
      {
        message: messages[1],
        index: 1,
        key: getChatHistoryItemKey(messages[1], 1),
      },
    ]])
  })

  it('does not render the retry button when the error is not preceded by a user message', async () => {
    const screen = await render(ChatHistory, {
      props: {
        messages: [
          { role: 'assistant', content: 'hello', slices: [], tool_results: [] },
          { role: 'error', content: 'Remote sent 400 response' },
        ],
        style: 'height: 480px; width: 480px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    expect(screen.container.textContent).not.toContain('Retry')
  })

  it('emits tool-call-rerun with message context when a tool call rerun button is clicked', async () => {
    const args = JSON.stringify({ location: 'Tokyo' })
    const assistantMessage: ChatHistoryItem = {
      role: 'assistant',
      content: '',
      slices: [
        {
          type: 'tool-call',
          toolCall: {
            toolCallId: 'call-weather',
            toolCallType: 'function',
            toolName: 'weather',
            args,
          },
        },
      ],
      tool_results: [],
      createdAt: 1710000000000,
    }
    const messages: ChatHistoryItem[] = [
      { role: 'user', content: 'weather in Tokyo' },
      assistantMessage,
    ]

    const screen = await render(ChatHistory, {
      props: {
        messages,
        style: 'height: 480px; width: 480px; overflow-y: auto;',
      },
      global: {
        plugins: [createEnglishI18n()],
      },
    })

    await screen.getByLabelText('Re-run tool call').click()

    expect(screen.emitted('toolCallRerun')).toEqual([[
      {
        message: assistantMessage,
        index: 1,
        key: getChatHistoryItemKey(assistantMessage, 1),
        toolCallId: 'call-weather',
        toolName: 'weather',
        args,
      },
    ]])
  })
})
