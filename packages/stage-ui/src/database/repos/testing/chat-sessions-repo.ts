import { vi } from 'vitest'

/**
 * Creates a `chat-sessions.repo` module stand-in for browser tests of stores that use chat sessions.
 * Every method resolves at once and stores nothing. Each method is a `vi.fn()` spy.
 *
 * @example
 * vi.mock('../database/repos/chat-sessions.repo', async () => (await import('../database/repos/testing/chat-sessions-repo')).createChatSessionsRepoMockModule())
 */
export function createChatSessionsRepoMockModule() {
  return {
    chatSessionsRepo: {
      addTombstone: vi.fn().mockResolvedValue(undefined),
      deleteSession: vi.fn().mockResolvedValue(undefined),
      dequeueOutbox: vi.fn().mockResolvedValue(undefined),
      dropOutboxForSession: vi.fn().mockResolvedValue(undefined),
      enqueueOutbox: vi.fn().mockResolvedValue(undefined),
      getIndex: vi.fn().mockResolvedValue(null),
      getOutbox: vi.fn().mockResolvedValue([]),
      getSession: vi.fn().mockResolvedValue(null),
      getTombstones: vi.fn().mockResolvedValue([]),
      removeTombstones: vi.fn().mockResolvedValue(undefined),
      saveIndex: vi.fn().mockResolvedValue(undefined),
      saveSession: vi.fn().mockResolvedValue(undefined),
      updateOutboxEntries: vi.fn().mockResolvedValue(undefined),
    },
  }
}
