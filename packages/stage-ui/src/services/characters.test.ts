import type { CreateCharacterPayload } from '../types/character'

import { describe, expect, it, vi } from 'vitest'

import { charactersService } from './characters'

const payload = {
  character: {
    version: '1',
    coverUrl: 'cover.png',
    characterId: 'airi',
  },
  capabilities: [],
  avatarModels: [],
  i18n: [],
  prompts: [],
} satisfies CreateCharacterPayload

/**
 * @example
 * describe('services characters', () => {})
 */
describe('services characters', () => {
  /**
   * @example
   * const character = charactersService.buildLocal('user-1', payload)
   */
  it('builds a schema-valid local character with owner fields', () => {
    const character = charactersService.buildLocal('user-1', payload)

    expect(character.id).toBeDefined()
    expect(character.creatorId).toBe('user-1')
    expect(character.ownerId).toBe('user-1')
    expect(character.characterId).toBe('airi')
    expect(character.likes).toEqual([])
    expect(character.bookmarks).toEqual([])
  })

  /**
   * @example
   * await charactersService.fetchRemote(client, { all: true })
   */
  it('fetches remote characters and parses them', async () => {
    const built = charactersService.buildLocal('user-1', payload)
    const client = {
      api: {
        v1: {
          characters: {
            $get: vi.fn(() => ({ ok: true, json: async () => [built] })),
            $post: vi.fn(() => ({ ok: true, json: async () => built })),
            ':id': {
              $delete: vi.fn(() => ({ ok: true })),
              $get: vi.fn(() => ({ ok: true, json: async () => built })),
              $patch: vi.fn(() => ({ ok: true, json: async () => built })),
              bookmark: {
                $post: vi.fn(() => ({ ok: true, json: async () => built })),
              },
              like: {
                $post: vi.fn(() => ({ ok: true, json: async () => built })),
              },
            },
          },
        },
      },
    } as unknown as Parameters<typeof charactersService.fetchRemote>[0]

    await expect(charactersService.fetchRemote(client, { all: true })).resolves.toEqual([built])
    expect(client.api.v1.characters.$get).toHaveBeenCalledWith({ query: { all: 'true' } }, undefined)
  })

  /**
   * @example
   * await expect(charactersService.fetchRemote(client, {}, { abortSignal })).rejects.toThrow()
   */
  it('throws before remote work when aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const client = {
      api: {
        v1: {
          characters: {
            $get: vi.fn(),
            $post: vi.fn(),
            ':id': {
              $delete: vi.fn(),
              $get: vi.fn(),
              $patch: vi.fn(),
              bookmark: {
                $post: vi.fn(),
              },
              like: {
                $post: vi.fn(),
              },
            },
          },
        },
      },
    }

    await expect(charactersService.fetchRemote(client, {}, { abortSignal: controller.signal })).rejects.toThrow()
  })
})
