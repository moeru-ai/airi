import { beforeAll, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createProviderService } from '../providers'

import * as schema from '../../schemas'

describe('providerService', () => {
  let db: any
  let service: ReturnType<typeof createProviderService>
  let testUser: any

  beforeAll(async () => {
    db = await mockDB(schema)
    service = createProviderService(db)

    // Create a test user for foreign key constraints
    const [user] = await db.insert(schema.user).values({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
    }).returning()
    testUser = user
  })

  it('create should handle provider config creation', async () => {
    const providerData = {
      id: 'prov-1',
      ownerId: testUser.id,
      definitionId: 'openai',
      name: 'My OpenAI',
      config: { apiKey: 'sk-123' },
      validated: true,
      validationBypassed: false,
    }

    const result = await service.create(providerData)
    expect(result.id).toBe('prov-1')
    expect(result.name).toBe('My OpenAI')

    const found = await service.findById('prov-1')
    expect(found?.definitionId).toBe('openai')
    expect((found?.config as any).apiKey).toBe('sk-123')
  })

  it('findByOwnerId should return providers for the user', async () => {
    const result = await service.findByOwnerId(testUser.id)
    expect(result.length).toBe(1)
    expect(result[0].ownerId).toBe(testUser.id)
  })

  it('update should update provider fields', async () => {
    await service.update('prov-1', { name: 'Updated OpenAI' })
    const prov = await service.findById('prov-1')
    expect(prov?.name).toBe('Updated OpenAI')
  })

  it('delete should soft delete provider', async () => {
    await service.delete('prov-1')
    const prov = await service.findById('prov-1')
    expect(prov).toBeUndefined()
  })
})

