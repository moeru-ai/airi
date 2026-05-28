import type { ChatHistoryItem, StreamingAssistantMessage } from '../../../../types/chat'

import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent } from 'vue'
import { createI18n } from 'vue-i18n'

import ChatHistory from './history.vue'

vi.mock('../composables/use-chat-history-scroll', () => ({
  useChatHistoryScroll: () => undefined,
}))

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
              'stopped': 'Stopped',
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
    name: 'AssistantBadgeHarness',
    components: {
      ChatHistory,
    },
    setup() {
      return { messages }
    },
    template: `<ChatHistory :messages="messages" />`,
  })
}

/**
 * @example
 * describe('assistant stopped badge', () => {
 *   it('renders the Stopped badge for an interrupted assistant turn', async () => {})
 * })
 */
describe('assistant stopped badge', () => {
  /**
   * @example
   * A stopped assistant turn renders the "Stopped" badge so the user can see
   * the response was cancelled rather than completed.
   */
  it('renders the Stopped badge for an interrupted assistant turn', async () => {
    const stopped: StreamingAssistantMessage = {
      role: 'assistant',
      content: 'partial reply',
      slices: [{ type: 'text', text: 'partial reply' }],
      tool_results: [],
      stopped: true,
    }
    const messages: ChatHistoryItem[] = [stopped]

    await render(createHarness(messages), {
      global: {
        plugins: [createTestI18n()],
      },
    })

    expect(document.body.textContent).toContain('Stopped')
  })

  /**
   * @example
   * A normal completed assistant turn does not render the badge.
   */
  it('does not render the Stopped badge for a completed assistant turn', async () => {
    const completed: StreamingAssistantMessage = {
      role: 'assistant',
      content: 'done',
      slices: [{ type: 'text', text: 'done' }],
      tool_results: [],
    }
    const messages: ChatHistoryItem[] = [completed]

    await render(createHarness(messages), {
      global: {
        plugins: [createTestI18n()],
      },
    })

    expect(document.body.textContent).not.toContain('Stopped')
  })
})
