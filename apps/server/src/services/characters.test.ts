import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createCharacterService } from './characters'

import * as schema from '../schemas/characters'

describe('characterService', () => {
  let db: any
  let service: ReturnType<typeof createCharacterService>

  beforeEach(() => {
    db = {
      query: {
        character: {
          findFirst: vi.fn(),
          findMany: vi.fn(),
        },
      },
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: vi.fn(),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(),
        })),
      })),
      transaction: vi.fn(async (cb: any) => {
        const tx = {
          insert: vi.fn(() => ({
            values: vi.fn(() => ({
              returning: vi.fn(),
            })),
          })),
        }
        return await cb(tx)
      }),
    }
    service = createCharacterService(db)
  })

  it('findById should return a character with relations', async () => {
    const mockChar = { id: '1', name: 'Test' }
    db.query.character.findFirst.mockResolvedValue(mockChar)

    const result = await service.findById('1')
    expect(result).toEqual(mockChar)
    expect(db.query.character.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.any(Object),
      with: {
        capabilities: true,
        avatarModels: true,
        i18n: true,
        prompts: true,
      },
    }))
  })

  it('findByOwnerId should return user characters', async () => {
    const mockChars = [{ id: '1' }]
    db.query.character.findMany.mockResolvedValue(mockChars)

    const result = await service.findByOwnerId('user-1')
    expect(result).toEqual(mockChars)
    expect(db.query.character.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.any(Object),
      with: { i18n: true },
    }))
  })

  it('create should handle full character creation in transaction', async () => {
    const characterData = { id: 'char-1', name: 'Test' } as any
    const insertedChar = { id: 'char-1' }

    db.transaction.mockImplementation(async (cb: any) => {
      const tx = {
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([insertedChar]),
          })),
        })),
      }
      return await cb(tx)
    })

    const result = await service.create({
      character: characterData,
      capabilities: [{ id: 'cap-1', type: 'llm', config: {} } as any],
    })

    expect(result).toEqual(insertedChar)
    expect(db.transaction).toHaveBeenCalled()
  })

  it('create should handle all optional relations', async () => {
    const characterData = { id: 'char-1' } as any
    const insertedChar = { id: 'char-1' }

    db.transaction.mockImplementation(async (cb: any) => {
      const tx = {
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([insertedChar]),
          })),
        })),
      }
      return await cb(tx)
    })

    await service.create({
      character: characterData,
      avatarModels: [{ id: 'am-1' } as any],
      i18n: [{ id: 'i18n-1' } as any],
      prompts: [{ id: 'p-1' } as any],
    })

    expect(db.transaction).toHaveBeenCalled()
  })

  it('update should update character and updatedAt', async () => {
    const updateData = { version: '2.0' }
    const mockReturning = [{ id: '1', ...updateData }]

    // Setup nested mocks for update chain
    const returningMock = vi.fn().mockResolvedValue(mockReturning)
    const whereMock = vi.fn(() => ({ returning: returningMock }))
    const setMock = vi.fn(() => ({ where: whereMock }))
    db.update.mockReturnValue({ set: setMock })

    const result = await service.update('1', updateData)
    expect(result).toEqual(mockReturning)
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({
      ...updateData,
      updatedAt: expect.any(Date),
    }))
  })

  it('delete should remove character', async () => {
    const mockReturning = [{ id: '1' }]
    const returningMock = vi.fn().mockResolvedValue(mockReturning)
    const whereMock = vi.fn(() => ({ returning: returningMock }))
    db.delete.mockReturnValue({ where: whereMock })

    const result = await service.delete('1')
    expect(result).toEqual(mockReturning)
    expect(db.delete).toHaveBeenCalledWith(schema.character)
  })
})
