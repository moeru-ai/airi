import { createPinia, defineStore } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { computed, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import ChatSessionsDrawer from './sessions-drawer.vue'

vi.mock('../../../../composables/use-analytics', () => ({
  useAnalytics: () => ({
    trackChatSessionSelected: vi.fn(),
    trackChatSessionStarted: vi.fn(),
  }),
}))

vi.mock('../../../../composables/use-breakpoints', () => ({
  useBreakpoints: () => ({
    isDesktop: computed(() => false),
  }),
}))

vi.mock('../../../../stores/auth', () => ({
  useAuthStore: defineStore('test-auth', () => ({
    userId: ref('local'),
  })),
}))

vi.mock('../../../../stores/chat/session-store', () => ({
  useChatSessionStore: defineStore('test-chat-session', () => {
    const activeSessionId = ref('session-1')
    const sessionMessages = ref({
      'session-1': [{ role: 'user', content: 'Existing conversation' }],
    })
    const sessionMetas = ref({
      'session-1': {
        sessionId: 'session-1',
        userId: 'local',
        characterId: 'default',
        createdAt: 1,
        updatedAt: 1,
      },
    })

    return {
      activeSessionId,
      sessionMessages,
      sessionMetas,
      createSession: vi.fn(async () => 'session-2'),
      deleteSession: vi.fn(async () => undefined),
      loadSession: vi.fn(async () => undefined),
      setActiveSession: vi.fn((sessionId: string) => {
        activeSessionId.value = sessionId
      }),
    }
  }),
}))

vi.mock('../../../../stores/modules/airi-card', () => ({
  useAiriCardStore: defineStore('test-airi-card', () => ({
    activeCardId: ref('default'),
  })),
}))

vi.mock('../../../../stores/modules/consciousness', () => ({
  useConsciousnessStore: defineStore('test-consciousness', () => ({
    activeModel: ref('test-model'),
  })),
}))

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        stage: {
          chat: {
            sessions: {
              'title': 'Conversations',
              'new': 'New conversation',
              'empty': 'No conversations',
              'delete': 'Delete conversation',
              'cloud-badge': 'Cloud synced',
              'new-chat-fallback': 'New conversation',
            },
          },
        },
      },
    },
  })
}

async function renderDrawer(options: {
  createSession?: (characterId: string) => Promise<string>
  deleteSession?: (sessionId: string) => Promise<void>
}) {
  const pinia = createPinia()

  return await render(ChatSessionsDrawer, {
    props: {
      modelValue: true,
      presentation: 'dialog',
      createSession: options.createSession,
      deleteSession: options.deleteSession,
    },
    global: {
      plugins: [pinia, createTestI18n()],
    },
  })
}

describe('chat sessions drawer desktop window actions', () => {
  // https://github.com/moeru-ai/airi/issues/2085
  it('issue #2085: forces the dialog boundary in a narrow desktop window', async () => {
    await renderDrawer({})

    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.querySelector('[data-vaul-drawer]')).toBeNull()
  })

  // https://github.com/moeru-ai/airi/issues/2085
  it('issue #2085: delegates create and delete to the window action adapter', async () => {
    const createSession = vi.fn(async () => 'session-2')
    const deleteSession = vi.fn(async () => undefined)
    const screen = await renderDrawer({ createSession, deleteSession })

    await screen.getByRole('button', { name: 'Delete conversation' }).click()
    await expect.poll(() => deleteSession.mock.calls.length).toBe(1)
    expect(deleteSession).toHaveBeenCalledWith('session-1')

    await screen.getByRole('button', { name: 'New conversation' }).click()
    await expect.poll(() => createSession.mock.calls.length).toBe(1)
    expect(createSession).toHaveBeenCalledWith('default')
  })
})
