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

const index = {
  userId: 'local',
  characters: {
    'char-a': {
      activeSessionId: 's1',
      sessions: {
        s1: { sessionId: 's1', userId: 'local', characterId: 'char-a', createdAt: 0, updatedAt: 0 },
      },
    },
  },
}

describe('chatSessionsRepo index', () => {
  it('returns null before the first index write', async () => {
    await expect(chatSessionsRepo.getIndex('local')).resolves.toBeNull()
  })

  it('round-trips the session index under its owner key', async () => {
    await chatSessionsRepo.saveIndex(index)

    await expect(chatSessionsRepo.getIndex('local')).resolves.toEqual(index)
    await expect(chatSessionsRepo.getIndex('other')).resolves.toBeNull()
  })
})

describe('chatSessionsRepo sessions', () => {
  it('returns null for a session that was never saved', async () => {
    await expect(chatSessionsRepo.getSession('missing')).resolves.toBeNull()
  })

  it('round-trips a session record', async () => {
    const record = {
      meta: { sessionId: 's1', userId: 'local', characterId: 'char-a', createdAt: 0, updatedAt: 0 },
      messages: [{ role: 'user' as const, content: 'hello' }],
    }
    await chatSessionsRepo.saveSession('s1', record)

    await expect(chatSessionsRepo.getSession('s1')).resolves.toEqual(record)
  })

  it('deletes one session without touching the others', async () => {
    await chatSessionsRepo.saveSession('s1', { meta: { sessionId: 's1', userId: 'local', characterId: 'char-a', createdAt: 0, updatedAt: 0 }, messages: [] })
    await chatSessionsRepo.saveSession('s2', { meta: { sessionId: 's2', userId: 'local', characterId: 'char-a', createdAt: 0, updatedAt: 0 }, messages: [] })

    await chatSessionsRepo.deleteSession('s1')

    await expect(chatSessionsRepo.getSession('s1')).resolves.toBeNull()
    await expect(chatSessionsRepo.getSession('s2')).resolves.not.toBeNull()
  })
})

describe('chatSessionsRepo.clear', () => {
  it('removes the index and every session it lists', async () => {
    await chatSessionsRepo.saveIndex(index)
    await chatSessionsRepo.saveSession('s1', { meta: { sessionId: 's1', userId: 'local', characterId: 'char-a', createdAt: 0, updatedAt: 0 }, messages: [] })

    await chatSessionsRepo.clear('local')

    await expect(chatSessionsRepo.getIndex('local')).resolves.toBeNull()
    await expect(chatSessionsRepo.getSession('s1')).resolves.toBeNull()
  })
})
