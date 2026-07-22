// @vitest-environment jsdom

import type { Ref } from 'vue'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'

import InteractiveArea from './InteractiveArea.vue'

interface MockMessage {
  role: string
  content: string
}

interface MockState {
  activeCard: Ref<{ name: string }>
  activeCardId: Ref<string>
  activeSessionId: string
  messages: Ref<MockMessage[]>
  requestIngest: ReturnType<typeof vi.fn>
  sessionMessages: Record<string, MockMessage[]>
  setSessionMessages: ReturnType<typeof vi.fn>
}

let mockState: MockState

vi.mock('pinia', async (importOriginal) => {
  const pinia = await importOriginal<typeof import('pinia')>()
  return {
    ...pinia,
    storeToRefs: (store: object) => store,
  }
})

vi.mock('@proj-airi/stage-layouts/composables/useStopSpeakingButton', () => ({
  useStopSpeakingButton: () => ({
    showStopSpeakingButton: ref(false),
    stopSpeakingFromChat: vi.fn(),
  }),
}))

vi.mock('@proj-airi/stage-ui/components', () => ({
  ChatHistory: { render: () => null },
  JournalPreviewModal: { render: () => null },
}))

vi.mock('@proj-airi/stage-ui/composables/use-analytics', () => ({
  useAnalytics: () => ({
    trackChatMessageDeleted: vi.fn(),
    trackChatMessageRetried: vi.fn(),
    trackChatMessagesCleared: vi.fn(),
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/background', () => ({
  useBackgroundStore: () => ({
    initializeStore: vi.fn(),
    journalEntries: [],
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/chat', () => ({
  useChatOrchestratorStore: () => ({ sending: ref(false) }),
}))

vi.mock('@proj-airi/stage-ui/stores/chat/session-store', () => ({
  useChatSessionStore: () => ({
    get activeSessionId() {
      return mockState.activeSessionId
    },
    getSessionMessages: (sessionId: string) => mockState.sessionMessages[sessionId] ?? [],
    messages: mockState.messages,
    setSessionMessages: mockState.setSessionMessages,
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/chat/stream-store', () => ({
  useChatStreamStore: () => ({
    streamingMessage: ref({ role: 'assistant', content: '', slices: [], tool_results: [] }),
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/journal-preview', () => ({
  useJournalPreviewStore: () => ({
    downloadImage: vi.fn(),
    openImagePreview: vi.fn(),
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/modules/airi-card', () => ({
  useAiriCardStore: () => ({
    activeCard: mockState.activeCard,
    activeCardId: mockState.activeCardId,
  }),
}))

vi.mock('@vueuse/core', async (importOriginal) => {
  const vueuse = await importOriginal<typeof import('@vueuse/core')>()
  return {
    ...vueuse,
    useLocalStorage: () => ref('enter'),
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('reka-ui', () => {
  const passthrough = {
    setup: (_props: object, context: { slots: { default?: () => unknown } }) => () => context.slots.default?.(),
  }
  return {
    DropdownMenuContent: passthrough,
    DropdownMenuItem: passthrough,
    DropdownMenuPortal: passthrough,
    DropdownMenuRoot: passthrough,
    DropdownMenuTrigger: passthrough,
  }
})

vi.mock('../stores/chat-sync', () => ({
  useChatSyncStore: () => ({
    requestCleanup: vi.fn(),
    requestDeleteMessage: vi.fn(),
    requestIngest: mockState.requestIngest,
    requestRetry: vi.fn(),
    requestToolCallRerun: vi.fn(),
  }),
}))

describe('interactive area', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)

    const sessionMessages: Record<string, MockMessage[]> = {
      'session-a': [{ role: 'system', content: 'A history' }],
      'session-b': [{ role: 'system', content: 'B history' }],
    }
    mockState = {
      activeCard: ref({ name: 'Airi' }),
      activeCardId: ref('default'),
      activeSessionId: 'session-b',
      messages: ref(sessionMessages['session-b']!),
      requestIngest: vi.fn(),
      sessionMessages,
      setSessionMessages: vi.fn(),
    }
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  // https://github.com/moeru-ai/airi/pull/2086#discussion_r3628804992
  it('restores a failed send to its captured session for Issue #2085', async () => {
    // ROOT CAUSE:
    //
    // The send request captured session B, but the rejection path read the
    // reactive active session again. Switching to A while the request was
    // pending therefore persisted B's failure into A's message list.
    let rejectSend: ((error: Error) => void) | undefined
    mockState.requestIngest.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
      rejectSend = reject
    }))

    const app = createApp(InteractiveArea)
    app.mount(container)

    const textarea = container.querySelector('textarea')
    expect(textarea).not.toBeNull()
    textarea!.value = 'send from B'
    textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    textarea!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))

    await vi.waitFor(() => {
      expect(mockState.requestIngest).toHaveBeenCalledWith(expect.objectContaining({
        sessionId: 'session-b',
        text: 'send from B',
      }))
    })

    mockState.activeSessionId = 'session-a'
    mockState.messages.value = mockState.sessionMessages['session-a']!
    rejectSend?.(new Error('hydrate failed'))
    await nextTick()

    await vi.waitFor(() => {
      expect(mockState.setSessionMessages).toHaveBeenCalledWith('session-b', [
        { role: 'system', content: 'B history' },
        { role: 'error', content: 'hydrate failed' },
      ])
    })
    expect(mockState.setSessionMessages).not.toHaveBeenCalledWith('session-a', expect.any(Array))

    app.unmount()
  })
})
