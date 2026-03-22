import type { MemoryRecord, MemorySearchResult } from '@proj-airi/server-sdk'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useChatContextStore } from './chat/context-store'
import { useMemoryStore } from './memory'

const harness = vi.hoisted(() => {
  const listeners = new Map<string, Set<(event: any) => void | Promise<void>>>()
  const sent: any[] = []

  function createMemoryRecord(partial?: Partial<MemoryRecord>): MemoryRecord {
    const now = Date.now()

    return {
      id: partial?.id || 'memory-1',
      scope: partial?.scope || {
        userId: 'user-1',
        characterId: 'airi',
        sessionId: 'session-1',
        chatId: 'chat-1',
        module: 'stage-ui',
        namespace: 'chat',
      },
      kind: partial?.kind || 'preference',
      content: partial?.content || 'User loves pour-over coffee.',
      summary: partial?.summary || 'User preference: pour-over coffee',
      tags: partial?.tags || ['coffee', 'preference'],
      importance: partial?.importance || 8,
      confidence: partial?.confidence || 0.9,
      emotionalIntensity: partial?.emotionalIntensity || 0,
      source: partial?.source || {
        kind: 'chat-turn',
        actor: 'user',
        module: 'stage-ui',
      },
      metadata: partial?.metadata,
      embeddingModel: partial?.embeddingModel || 'smoke',
      embedding: partial?.embedding || [0.8, 0.2],
      createdAt: partial?.createdAt || now,
      updatedAt: partial?.updatedAt || now,
      lastAccessedAt: partial?.lastAccessedAt || now,
      accessCount: partial?.accessCount || 0,
      archived: partial?.archived || false,
    }
  }

  function createSearchResult(partial?: Partial<MemorySearchResult>): MemorySearchResult {
    return {
      item: partial?.item || createMemoryRecord(),
      score: partial?.score || 0.91,
      reasons: partial?.reasons || [
        { kind: 'semantic', value: 0.9 },
        { kind: 'lexical', value: 0.8 },
      ],
    }
  }

  const state = {
    searchResults: [createSearchResult()],
    ingestResult: {
      created: [createMemoryRecord({ id: 'memory-ingested', kind: 'episodic' })],
      updated: [] as MemoryRecord[],
      merged: [] as MemoryRecord[],
    },
    consolidateResult: {
      analyzed: 1,
      touchedScopes: 1,
      created: [createMemoryRecord({
        id: 'working-1',
        kind: 'working',
        content: 'Current working memory snapshot.',
        summary: 'Working memory: coffee and reminder',
      })],
      updated: [] as MemoryRecord[],
      merged: [] as MemoryRecord[],
      archivedIds: [] as string[],
      summaries: ['scope=chat outputs=working'],
    },
    statsResult: {
      stats: {
        total: 1,
        archived: 0,
        byKind: {
          preference: 1,
        },
        scopes: {
          users: 1,
          characters: 1,
          chats: 1,
          sessions: 1,
          modules: 1,
          namespaces: 1,
        },
      },
    },
    deleteResult: {
      deleted: 0,
      archived: 1,
      ids: ['memory-1'],
    },
  }

  async function emit(type: string, data: any) {
    const handlers = Array.from(listeners.get(type) || [])
    for (const handler of handlers) {
      await handler({ type, data })
    }
  }

  const ensureConnected = vi.fn(async () => {})
  const onEvent = vi.fn((type: string, callback: (event: any) => void | Promise<void>) => {
    const handlers = listeners.get(type) || new Set()
    handlers.add(callback)
    listeners.set(type, handlers)

    return () => {
      handlers.delete(callback)
      if (handlers.size === 0)
        listeners.delete(type)
    }
  })

  const send = vi.fn((event: any) => {
    sent.push(event)

    queueMicrotask(async () => {
      switch (event.type) {
        case 'memory:search:request':
          await emit('memory:search:response', {
            requestId: event.data.requestId,
            query: event.data.query,
            results: state.searchResults,
            total: state.searchResults.length,
            tookMs: 1,
          })
          break
        case 'memory:ingest:chat-turn':
          await emit('memory:ingest:chat-turn:result', {
            requestId: event.data.requestId,
            ...state.ingestResult,
          })
          break
        case 'memory:consolidate:request':
          await emit('memory:consolidate:result', {
            requestId: event.data.requestId,
            ...state.consolidateResult,
          })
          break
        case 'memory:stats:request':
          await emit('memory:stats:response', {
            requestId: event.data.requestId,
            ...state.statsResult,
          })
          break
        case 'memory:delete':
          await emit('memory:delete:result', {
            requestId: event.data.requestId,
            ...state.deleteResult,
          })
          break
      }
    })
  })

  function reset() {
    listeners.clear()
    sent.length = 0
    ensureConnected.mockClear()
    onEvent.mockClear()
    send.mockClear()

    state.searchResults = [createSearchResult()]
    state.ingestResult = {
      created: [createMemoryRecord({ id: 'memory-ingested', kind: 'episodic' })],
      updated: [],
      merged: [],
    }
    state.consolidateResult = {
      analyzed: 1,
      touchedScopes: 1,
      created: [createMemoryRecord({
        id: 'working-1',
        kind: 'working',
        content: 'Current working memory snapshot.',
        summary: 'Working memory: coffee and reminder',
      })],
      updated: [],
      merged: [],
      archivedIds: [],
      summaries: ['scope=chat outputs=working'],
    }
    state.statsResult = {
      stats: {
        total: 1,
        archived: 0,
        byKind: {
          preference: 1,
        },
        scopes: {
          users: 1,
          characters: 1,
          chats: 1,
          sessions: 1,
          modules: 1,
          namespaces: 1,
        },
      },
    }
    state.deleteResult = {
      deleted: 0,
      archived: 1,
      ids: ['memory-1'],
    }
  }

  return {
    sent,
    state,
    ensureConnected,
    onEvent,
    send,
    reset,
  }
})

vi.mock('./mods/api/channel-server', () => ({
  useModsServerChannelStore: () => ({
    connected: { value: true },
    ensureConnected: harness.ensureConnected,
    initialize: harness.ensureConnected,
    send: harness.send,
    sendContextUpdate: vi.fn(),
    onContextUpdate: vi.fn(),
    onEvent: harness.onEvent,
    dispose: vi.fn(),
  }),
}))

function installStorageShim() {
  const storage = new Map<string, string>()

  const localStorage = {
    getItem(key: string) {
      return storage.has(key) ? storage.get(key)! : null
    },
    setItem(key: string, value: string) {
      storage.set(key, String(value))
    },
    removeItem(key: string) {
      storage.delete(key)
    },
    clear() {
      storage.clear()
    },
    key(index: number) {
      return Array.from(storage.keys())[index] || null
    },
    get length() {
      return storage.size
    },
  }

  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorage,
    configurable: true,
  })
  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    },
    configurable: true,
  })
}

describe('memory store integration', () => {
  beforeEach(() => {
    harness.reset()
    installStorageShim()
    setActivePinia(createPinia())
  })

  it('recalls search results into chat context and clears stale memory recall when no results are found', async () => {
    const memoryStore = useMemoryStore()
    const contextStore = useChatContextStore()
    const scope = {
      userId: 'user-1',
      characterId: 'airi',
      sessionId: 'session-1',
      chatId: 'chat-1',
      module: 'stage-ui',
      namespace: 'chat',
    }

    const recallResponse = await memoryStore.recallIntoContext({
      query: 'What does the user like to drink?',
      scope,
      lane: 'memory',
    })

    expect(recallResponse?.results).toHaveLength(1)
    expect(harness.sent.map(event => event.type)).toContain('memory:search:request')

    const firstSnapshot = contextStore.getContextsSnapshot()
    expect(firstSnapshot['memory-pgvector:stage-ui-memory-bridge']).toHaveLength(1)
    expect(firstSnapshot['memory-pgvector:stage-ui-memory-bridge']?.[0]?.text).toContain('pour-over coffee')

    harness.state.searchResults = []

    const emptyResponse = await memoryStore.recallIntoContext({
      query: 'No related memory should be recalled here',
      scope,
      lane: 'memory',
    })

    expect(emptyResponse?.results).toHaveLength(0)
    expect(contextStore.getContextsSnapshot()['memory-pgvector:stage-ui-memory-bridge']).toBeUndefined()
  })

  it('ingests a completed chat turn and automatically consolidates the touched scope', async () => {
    const memoryStore = useMemoryStore()
    const scope = {
      userId: 'user-1',
      characterId: 'airi',
      sessionId: 'session-1',
      chatId: 'chat-1',
      module: 'stage-ui',
      namespace: 'chat',
    }

    const ingestResult = await memoryStore.rememberChatTurn({
      scope,
      userMessage: 'Please remember that I prefer pour-over coffee.',
      assistantMessage: 'I will remember your coffee preference.',
      explicit: true,
      tags: ['chat'],
    })

    expect(ingestResult?.created).toHaveLength(1)
    expect(harness.sent.map(event => event.type)).toContain('memory:ingest:chat-turn')

    await vi.waitFor(() => {
      expect(harness.sent.map(event => event.type)).toContain('memory:consolidate:request')
      expect(memoryStore.lastConsolidateResponse?.created[0]?.kind).toBe('working')
    })

    const consolidateEvent = harness.sent.find(event => event.type === 'memory:consolidate:request')
    expect(consolidateEvent?.data?.filters?.scope).toMatchObject(scope)
  })
})
