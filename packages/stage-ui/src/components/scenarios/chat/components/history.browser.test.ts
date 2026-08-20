import type { ChatHistoryItem } from '../../../../types/chat'

import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { computed, defineComponent, shallowRef } from 'vue'
import { createI18n } from 'vue-i18n'

import ChatHistory from './history.vue'

import { getChatHistoryItemKey } from '../utils'

vi.mock('../../../markdown', () => ({
  MarkdownRenderer: defineComponent({
    name: 'MarkdownRendererStub',
    props: {
      content: {
        type: String,
        default: '',
      },
    },
    template: '<div>{{ content }}</div>',
  }),
}))

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        stage: {
          chat: {
            actions: {
              retry: 'Retry',
            },
            message: {
              'character-name': {
                'airi': 'AIRI',
                'core-system': 'System',
                'you': 'You',
              },
            },
          },
        },
      },
    },
  })
}

function createHarness(messages: ChatHistoryItem[]) {
  return defineComponent({
    name: 'ChatHistoryRetryHarness',
    components: {
      ChatHistory,
    },
    setup() {
      const lastRetryIndex = shallowRef('none')
      const lastToolCallRerunPayload = shallowRef('')

      function handleRetryMessage(payload: { index: number }) {
        lastRetryIndex.value = String(payload.index)
      }

      function handleToolCallRerun(payload: unknown) {
        lastToolCallRerunPayload.value = JSON.stringify(payload)
      }

      const toolCallRerunPayload = computed(() => lastToolCallRerunPayload.value)

      return {
        handleRetryMessage,
        handleToolCallRerun,
        lastRetryIndex,
        messages,
        toolCallRerunPayload,
      }
    },
    template: `
      <div style="height: 480px; width: 480px;">
        <ChatHistory
          :messages="messages"
          style="height: 100%; width: 100%; overflow-y: auto;"
          @retry-message="handleRetryMessage"
          @tool-call-rerun="handleToolCallRerun"
        />
        <output aria-label="retry-index">{{ lastRetryIndex }}</output>
        <output aria-label="tool-call-rerun">{{ toolCallRerunPayload }}</output>
      </div>
    `,
  })
}

function createVirtualizedHarness(messages: ChatHistoryItem[]) {
  return defineComponent({
    name: 'ChatHistoryVirtualizedHarness',
    components: {
      ChatHistory,
    },
    setup() {
      return {
        messages,
      }
    },
    template: `
      <div style="height: 240px; width: 320px;">
        <ChatHistory
          :messages="messages"
          variant="mobile"
          style="height: 100%; width: 100%; overflow-y: auto;"
        />
      </div>
    `,
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
  it('virtualizes long histories and reveals only messages inside the viewport', async () => {
    const messages: ChatHistoryItem[] = Array.from({ length: 100 }, (_, index) => ({
      id: `user-${index}`,
      role: 'user',
      content: `Message ${index} `.repeat(index % 6 + 1),
      createdAt: index,
    }))

    await render(createVirtualizedHarness(messages), {
      global: {
        plugins: [createTestI18n()],
      },
    })

    await vi.waitFor(() => {
      const renderedMessages = document.querySelectorAll<HTMLElement>('[data-chat-message-key]')
      expect(renderedMessages.length).toBeGreaterThan(0)
      expect(renderedMessages.length).toBeLessThan(messages.length)
    })

    await vi.waitFor(() => {
      const renderedIndexes = Array.from(document.querySelectorAll<HTMLElement>('[data-chat-message-index]'))
        .map(message => Number(message.dataset.chatMessageIndex))

      expect(Math.max(...renderedIndexes)).toBe(99)
    })

    await vi.waitFor(() => {
      const renderedMessages = Array.from(document.querySelectorAll<HTMLElement>('[data-chat-message-key]'))
      const visibleMessages = renderedMessages.filter(message => message.hasAttribute('data-chat-message-visible'))
      const hiddenMessages = renderedMessages.filter(message => !message.hasAttribute('data-chat-message-visible'))

      expect(visibleMessages.length).toBeGreaterThan(0)
      expect(hiddenMessages.length).toBeGreaterThan(0)
      expect(visibleMessages[0].classList.contains('opacity-100')).toBe(true)
      expect(visibleMessages[0].classList.contains('transition-opacity')).toBe(true)
      expect(hiddenMessages[0].classList.contains('opacity-0')).toBe(true)
    })

    const history = document.querySelector<HTMLElement>('.chat-history-list')
    expect(history).not.toBeNull()
    if (!history)
      throw new Error('Expected a chat history viewport.')

    history.scrollTop = 0
    history.dispatchEvent(new Event('scroll'))

    await vi.waitFor(() => {
      const renderedIndexes = Array.from(document.querySelectorAll<HTMLElement>('[data-chat-message-index]'))
        .map(message => Number(message.dataset.chatMessageIndex))

      expect(Math.min(...renderedIndexes)).toBe(0)
    })
  })

  it('mounts a stable mask on each mobile message surface', async () => {
    await render(ChatHistory, {
      props: {
        messages: [{ role: 'user', content: 'hello' }],
        variant: 'mobile',
        style: 'height: 240px; width: 320px; overflow-y: auto;',
      },
      global: {
        plugins: [createTestI18n()],
      },
    })

    await vi.waitFor(() => {
      expect(document.querySelector('[data-chat-message-surface]')).not.toBeNull()
    })

    const surface = document.querySelector<HTMLElement>('[data-chat-message-surface]')
    expect(surface).not.toBeNull()
    if (!surface)
      throw new Error('Expected a mobile chat message surface.')

    expect(getComputedStyle(surface).maskImage).not.toBe('none')
    await vi.waitFor(() => {
      expect(surface.closest('[data-chat-message-visible]')).not.toBeNull()
    })
  })

  // ROOT CAUSE:
  //
  // Cross-window synchronization can publish `sending` before it publishes the new stream.
  // The initial stream object has a timestamp but no message id, which rendered a short-lived bubble.
  //
  // We fixed this by rendering only a stream that has the stable id assigned to the assistant turn.
  it('does not render the initial empty stream while a synchronized send starts', async () => {
    await render(ChatHistory, {
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
        plugins: [createTestI18n()],
      },
    })

    expect(document.querySelectorAll('[data-chat-message-role="assistant"]')).toHaveLength(0)
  })

  /**
   * @example
   * it('emits retry-message when the retry button is clicked for an error after a user message', async () => {
   *   const screen = await render(createHarness(messages), { global: { plugins: [createTestI18n()] } })
   *   await screen.getByRole('button', { name: 'Retry' }).click()
   *   await expect.element(screen.getByLabelText('retry-index')).toHaveTextContent('1')
   * })
   */
  it('emits retry-message when the retry button is clicked for an error after a user message', async () => {
    const messages: ChatHistoryItem[] = [
      { role: 'user', content: 'hello' },
      { role: 'error', content: 'Remote sent 400 response' },
    ]

    const screen = await render(createHarness(messages), {
      global: {
        plugins: [createTestI18n()],
      },
    })

    await screen.getByRole('button', { name: 'Retry' }).click()

    await expect.element(screen.getByLabelText('retry-index')).toHaveTextContent('1')
  })

  /**
   * @example
   * it('does not render the retry button when the error is not preceded by a user message', async () => {
   *   const screen = await render(createHarness(messages), { global: { plugins: [createTestI18n()] } })
   *   expect(document.body.textContent).not.toContain('Retry')
   * })
   */
  it('does not render the retry button when the error is not preceded by a user message', async () => {
    const messages: ChatHistoryItem[] = [
      { role: 'assistant', content: 'hello', slices: [], tool_results: [] },
      { role: 'error', content: 'Remote sent 400 response' },
    ]

    await render(createHarness(messages), {
      global: {
        plugins: [createTestI18n()],
      },
    })

    expect(document.body.textContent).not.toContain('Retry')
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

    const screen = await render(createHarness(messages), {
      global: {
        plugins: [createTestI18n()],
      },
    })

    await screen.getByLabelText('Re-run tool call').click()

    await expect.element(screen.getByLabelText('tool-call-rerun')).toHaveTextContent(JSON.stringify({
      message: assistantMessage,
      index: 1,
      key: getChatHistoryItemKey(assistantMessage, 1),
      toolCallId: 'call-weather',
      toolName: 'weather',
      args,
    }))
  })
})
