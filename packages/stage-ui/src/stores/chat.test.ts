import type { ContextMessage } from '@proj-airi/server-sdk'

import type { ContextPayload } from './chat'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { useChatStore } from './chat'
import { installChatContextBridge } from './plugins/chat-context-bridge'

const mockSendContextUpdate = vi.fn()
const mockInitialize = vi.fn().mockResolvedValue(undefined)
let contextUpdateHandler: ((event: { type: 'context:update', data: ContextMessage }) => void | Promise<void>) | null = null
let broadcastPosts: unknown[] = []
let bridge: { dispose: () => void } | null = null

const localStorageMap = new Map<string, unknown>()

vi.mock('@vueuse/core', () => {
  return {
    useLocalStorage: <T>(key: string, defaultValue: T) => {
      if (!localStorageMap.has(key))
        localStorageMap.set(key, ref(defaultValue))

      return localStorageMap.get(key) as ReturnType<typeof ref<T>>
    },
    useBroadcastChannel: <T>() => {
      const data = ref<T | undefined>()
      const post = (value: T) => {
        broadcastPosts.push(value)
        data.value = value
      }

      return { data, post }
    },
  }
})

vi.mock('./llm', () => ({
  useLLM: () => ({
    stream: vi.fn(),
    discoverToolsCompatibility: vi.fn(),
  }),
}))

vi.mock('./modules', () => ({
  useAiriCardStore: () => ({
    systemPrompt: ref(''),
  }),
}))

vi.mock('./mods/api/channel-server', () => ({
  useModsServerChannelStore: () => ({
    connected: ref(true),
    initialize: mockInitialize,
    onContextUpdate: (cb: typeof contextUpdateHandler) => {
      contextUpdateHandler = cb
      return () => {
        contextUpdateHandler = null
      }
    },
    sendContextUpdate: mockSendContextUpdate,
  }),
}))

describe('chat store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    broadcastPosts = []
    localStorageMap.clear()
    mockSendContextUpdate.mockClear()
    mockInitialize.mockClear()
    contextUpdateHandler = null
    bridge = null
  })

  afterEach(() => {
    bridge?.dispose()
    bridge = null
    vi.clearAllMocks()
  })

  it('ingests assistant context updates from the channel server', async () => {
    const store = useChatStore()
    bridge = installChatContextBridge()
    expect(mockInitialize).toHaveBeenCalled()
    expect(contextUpdateHandler).toBeTruthy()

    const envelope: ContextMessage = {
      sessionId: 'session-ctx',
      ts: 123,
      role: 'assistant',
      source: 'llm',
      payload: { content: 'hello from server' },
    }

    await contextUpdateHandler?.({ type: 'context:update', data: envelope })

    store.setActiveSession('session-ctx')
    const last = store.messages.at(-1)
    expect(last?.role).toBe('assistant')
    expect(last?.content).toBe('hello from server')
  })

  it('publishes local context updates through the shared channel server store', () => {
    const store = useChatStore()
    bridge = installChatContextBridge()

    const envelope: ContextMessage = {
      sessionId: 'session-local',
      ts: 456,
      role: 'assistant',
      source: 'system',
      payload: { content: 'local broadcast' },
    }

    store.publishContextMessage(envelope as ContextMessage<ContextPayload, Record<string, unknown>>, 'local')

    expect(mockSendContextUpdate).toHaveBeenCalledWith(envelope)
    expect(broadcastPosts).toContain(envelope)
  })
})
