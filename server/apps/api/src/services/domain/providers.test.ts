import type { Database } from '../../libs/db'

import { Buffer } from 'node:buffer'

import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createEnvelopeCrypto } from '../../utils/envelope-crypto'
import { createProviderService } from './providers'

import * as schema from '../../schemas'

describe('providerService', () => {
  let db: Database
  let service: ReturnType<typeof createProviderService>
  let testUser: { id: string }

  beforeAll(async () => {
    db = await mockDB(schema)
    service = createProviderService(db, createEnvelopeCrypto({ masterKey: Buffer.alloc(32, 7) }))

    const [user] = await db.insert(schema.user).values({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
    }).returning()
    testUser = user
  })

  it('upserts with the client id and returns decrypted config', async () => {
    const result = await service.upsert({
      id: 'prov-1',
      ownerId: testUser.id,
      definitionId: 'openai',
      config: { apiKey: 'sk-123' },
    })

    expect(result.id).toBe('prov-1')
    expect(result.definitionId).toBe('openai')
    expect(result.config).toEqual({ apiKey: 'sk-123' })
    expect(result.deletedAt).toBeNull()
    expect(result.updatedAt).toEqual(expect.any(String))

    const stored = await db.query.userProviderConfigs.findFirst({
      where: eq(schema.userProviderConfigs.id, 'prov-1'),
    })
    expect(stored?.config.startsWith('v1.')).toBe(true)
    expect(stored?.config).not.toContain('sk-123')
  })

  it('lists live rows and tombstones for the owner', async () => {
    await service.upsert({
      id: 'prov-2',
      ownerId: testUser.id,
      definitionId: 'anthropic',
      config: { apiKey: 'sk-live' },
    })
    await service.upsert({
      id: 'prov-3',
      ownerId: testUser.id,
      definitionId: 'anthropic',
      config: { apiKey: 'sk-gone' },
    })
    await service.tombstone('prov-3', testUser.id)

    const listed = await service.listAll(testUser.id)
    const ids = listed.map(row => row.id).sort()
    expect(ids).toEqual(['prov-1', 'prov-2', 'prov-3'])

    const tombstone = listed.find(row => row.id === 'prov-3')
    expect(tombstone?.deletedAt).toEqual(expect.any(String))
    expect(tombstone?.config).toEqual({ apiKey: 'sk-gone' })
  })

  it('lets a later write overwrite the stored replica', async () => {
    await service.upsert({
      id: 'prov-1',
      ownerId: testUser.id,
      definitionId: 'openai',
      config: { apiKey: 'sk-new' },
    })

    const overwritten = await service.upsert({
      id: 'prov-1',
      ownerId: testUser.id,
      definitionId: 'openai',
      config: { apiKey: 'sk-overwritten' },
    })

    expect(overwritten.config).toEqual({ apiKey: 'sk-overwritten' })
    expect(overwritten.deletedAt).toBeNull()
  })

  it('does not change createdAt on later writes', async () => {
    const first = (await service.listAll(testUser.id)).find(row => row.id === 'prov-2')!
    const updated = await service.upsert({
      id: 'prov-2',
      ownerId: testUser.id,
      definitionId: 'anthropic',
      config: { apiKey: 'sk-later' },
    })

    expect(updated.createdAt).toBe(first.createdAt)
    expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(first.updatedAt))
  })

  it('lets two owners keep the same client instance id', async () => {
    const [otherUser] = await db.insert(schema.user).values({
      id: 'user-2',
      name: 'Other User',
      email: 'other@example.com',
    }).returning()

    const other = await service.upsert({
      id: 'prov-1',
      ownerId: otherUser.id,
      definitionId: 'openai',
      config: { apiKey: 'sk-other' },
    })

    expect(other.id).toBe('prov-1')
    expect(other.config).toEqual({ apiKey: 'sk-other' })

    const ownerRows = await service.listAll(testUser.id)
    const otherRows = await service.listAll(otherUser.id)
    expect(ownerRows.find(row => row.id === 'prov-1')?.config).toEqual({ apiKey: 'sk-overwritten' })
    expect(otherRows.map(row => row.id)).toEqual(['prov-1'])
    expect(otherRows[0]?.config).toEqual({ apiKey: 'sk-other' })
  })
})
