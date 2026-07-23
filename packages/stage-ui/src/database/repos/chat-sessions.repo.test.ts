import memoryDriver from 'unstorage/drivers/memory'

import { createStorage } from 'unstorage'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Replace the IDB-backed storage with an in-memory driver for tests; the
// repo's behavior is identical regardless of the underlying driver.
vi.mock('../storage', () => ({
  storage: createStorage({ driver: memoryDriver() }),
}))

const { chatSessionsRepo } = await import('./chat-sessions.repo')
const { storage } = await import('../storage')

beforeEach(async () => {
  await storage.clear()
})

describe('chatSessionsRepo.tombstones', () => {
  /**
   * @example
   * Initial fetch on a fresh user → empty array, never undefined / null.
   */
  it('returns an empty array for a user with no tombstones', async () => {
    expect(await chatSessionsRepo.getTombstones('user-1')).toEqual([])
  })

  /**
   * @example
   * Add same id twice → only one entry. Critical for an offline-then-online
   * delete flow where the same DELETE may be queued multiple times.
   */
  it('addTombstone is idempotent on the same cloudChatId', async () => {
    await chatSessionsRepo.addTombstone('user-1', 'chat-a')
    await chatSessionsRepo.addTombstone('user-1', 'chat-a')
    expect(await chatSessionsRepo.getTombstones('user-1')).toEqual(['chat-a'])
  })

  /**
   * @example
   * removeTombstones drops only the listed ids; others stay.
   */
  it('removeTombstones drops only the named ids', async () => {
    await chatSessionsRepo.addTombstone('user-1', 'a')
    await chatSessionsRepo.addTombstone('user-1', 'b')
    await chatSessionsRepo.addTombstone('user-1', 'c')
    await chatSessionsRepo.removeTombstones('user-1', ['a', 'c'])
    expect(await chatSessionsRepo.getTombstones('user-1')).toEqual(['b'])
  })

  /**
   * @example
   * Tombstones are scoped per user — clearing one user's tombstones must
   * not touch another's.
   */
  it('isolates tombstones per user', async () => {
    await chatSessionsRepo.addTombstone('user-1', 'a')
    await chatSessionsRepo.addTombstone('user-2', 'a')
    await chatSessionsRepo.removeTombstones('user-1', ['a'])
    expect(await chatSessionsRepo.getTombstones('user-1')).toEqual([])
    expect(await chatSessionsRepo.getTombstones('user-2')).toEqual(['a'])
  })
})

describe('chatSessionsRepo.outbox', () => {
  function makeEntry(partial: Partial<Parameters<typeof chatSessionsRepo.enqueueOutbox>[1]> & { messageId: string }): Parameters<typeof chatSessionsRepo.enqueueOutbox>[1] {
    return {
      messageId: partial.messageId,
      sessionId: partial.sessionId ?? 'session-1',
      cloudChatId: partial.cloudChatId,
      role: partial.role ?? 'user',
      content: partial.content ?? 'hello',
      attempts: partial.attempts ?? 0,
      lastError: partial.lastError,
      queuedAt: partial.queuedAt ?? 1,
    }
  }

  /**
   * @example
   * Empty outbox returns [] (never null / undefined).
   */
  it('returns an empty array for a user with no outbox entries', async () => {
    expect(await chatSessionsRepo.getOutbox('user-1')).toEqual([])
  })

  /**
   * @example
   * Two distinct messages → two entries, in enqueue order.
   */
  it('preserves enqueue order for distinct messages', async () => {
    await chatSessionsRepo.enqueueOutbox('user-1', makeEntry({ messageId: 'm1', queuedAt: 1 }))
    await chatSessionsRepo.enqueueOutbox('user-1', makeEntry({ messageId: 'm2', queuedAt: 2 }))
    const entries = await chatSessionsRepo.getOutbox('user-1')
    expect(entries.map(e => e.messageId)).toEqual(['m1', 'm2'])
  })

  /**
   * @example
   * Re-enqueueing the same messageId overwrites in place — a flap between
   * online and offline that calls pushMessageToCloud twice for the same
   * message must not duplicate the row in IDB.
   */
  it('enqueueOutbox is idempotent on messageId — overwrites in place', async () => {
    await chatSessionsRepo.enqueueOutbox('user-1', makeEntry({ messageId: 'm1', content: 'first' }))
    await chatSessionsRepo.enqueueOutbox('user-1', makeEntry({ messageId: 'm1', content: 'second' }))
    const entries = await chatSessionsRepo.getOutbox('user-1')
    expect(entries.length).toBe(1)
    expect(entries[0].content).toBe('second')
  })

  /**
   * @example
   * dequeueOutbox drops only the named ids.
   */
  it('dequeueOutbox drops only the named ids', async () => {
    await chatSessionsRepo.enqueueOutbox('user-1', makeEntry({ messageId: 'm1' }))
    await chatSessionsRepo.enqueueOutbox('user-1', makeEntry({ messageId: 'm2' }))
    await chatSessionsRepo.enqueueOutbox('user-1', makeEntry({ messageId: 'm3' }))
    await chatSessionsRepo.dequeueOutbox('user-1', ['m1', 'm3'])
    const entries = await chatSessionsRepo.getOutbox('user-1')
    expect(entries.map(e => e.messageId)).toEqual(['m2'])
  })

  /**
   * @example
   * updateOutboxEntries bumps attempts and lastError without touching the
   * other fields (content, role, queuedAt). This is the "send failed,
   * retry on next drain" path.
   */
  it('updateOutboxEntries patches attempts + lastError in place', async () => {
    await chatSessionsRepo.enqueueOutbox('user-1', makeEntry({ messageId: 'm1', content: 'hello', queuedAt: 1 }))
    await chatSessionsRepo.updateOutboxEntries('user-1', [{ messageId: 'm1', attempts: 3, lastError: 'HTTP 500' }])
    const entries = await chatSessionsRepo.getOutbox('user-1')
    expect(entries[0].attempts).toBe(3)
    expect(entries[0].lastError).toBe('HTTP 500')
    expect(entries[0].content).toBe('hello')
    expect(entries[0].queuedAt).toBe(1)
  })

  /**
   * @example
   * dropOutboxForSession drops every entry for a session — used when the
   * session is deleted locally (no point pushing messages to a deleted chat).
   */
  it('dropOutboxForSession removes entries scoped to a sessionId', async () => {
    await chatSessionsRepo.enqueueOutbox('user-1', makeEntry({ messageId: 'm1', sessionId: 's1' }))
    await chatSessionsRepo.enqueueOutbox('user-1', makeEntry({ messageId: 'm2', sessionId: 's1' }))
    await chatSessionsRepo.enqueueOutbox('user-1', makeEntry({ messageId: 'm3', sessionId: 's2' }))
    await chatSessionsRepo.dropOutboxForSession('user-1', 's1')
    const entries = await chatSessionsRepo.getOutbox('user-1')
    expect(entries.map(e => e.messageId)).toEqual(['m3'])
  })

  /**
   * @example
   * Outboxes are scoped per user — touching one must not affect another.
   */
  it('isolates outboxes per user', async () => {
    await chatSessionsRepo.enqueueOutbox('user-1', makeEntry({ messageId: 'm1' }))
    await chatSessionsRepo.enqueueOutbox('user-2', makeEntry({ messageId: 'm1' }))
    await chatSessionsRepo.dequeueOutbox('user-1', ['m1'])
    expect(await chatSessionsRepo.getOutbox('user-1')).toEqual([])
    expect((await chatSessionsRepo.getOutbox('user-2')).length).toBe(1)
  })
})

describe('chatSessionsRepo.clear', () => {
  /**
   * @example
   * clear() removes index, sessions, tombstones AND outbox for the user.
   */
  it('removes index + sessions + tombstones + outbox for the user', async () => {
    await chatSessionsRepo.saveIndex({
      userId: 'user-1',
      characters: { 'char-a': { activeSessionId: 's1', sessions: { s1: { sessionId: 's1', userId: 'user-1', characterId: 'char-a', createdAt: 0, updatedAt: 0 } } } },
    })
    await chatSessionsRepo.saveSession('s1', { meta: { sessionId: 's1', userId: 'user-1', characterId: 'char-a', createdAt: 0, updatedAt: 0 }, messages: [] })
    await chatSessionsRepo.addTombstone('user-1', 'cloud-a')
    await chatSessionsRepo.enqueueOutbox('user-1', { messageId: 'm1', sessionId: 's1', role: 'user', content: 'hi', attempts: 0, queuedAt: 0 })

    await chatSessionsRepo.clear('user-1')

    expect(await chatSessionsRepo.getIndex('user-1')).toBeNull()
    expect(await chatSessionsRepo.getSession('s1')).toBeNull()
    expect(await chatSessionsRepo.getTombstones('user-1')).toEqual([])
    expect(await chatSessionsRepo.getOutbox('user-1')).toEqual([])
  })
})
