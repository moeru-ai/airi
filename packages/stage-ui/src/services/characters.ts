import type { Character, CreateCharacterPayload, UpdateCharacterPayload } from '../types/character'

import { nanoid } from 'nanoid'
import { parse as parseValibot } from 'valibot'

import { CharacterWithRelationsSchema } from '../types/character'

interface RequestOptions {
  init: { signal: AbortSignal }
}

interface RemoteResponse<T> {
  json: () => Promise<T>
  ok: boolean
}

/**
 * Remote character API surface required by the character service.
 */
export interface CharactersRemoteClient {
  api: {
    v1: {
      characters: {
        '$get': (params: { query: { all: string } }, options?: RequestOptions) => Promise<RemoteResponse<unknown[]>>
        '$post': (params: { json: CreateCharacterPayload }, options?: RequestOptions) => Promise<RemoteResponse<unknown>>
        ':id': {
          $delete: (params: { param: { id: string } }, options?: RequestOptions) => Promise<{ ok: boolean }>
          $get: (params: { param: { id: string } }, options?: RequestOptions) => Promise<RemoteResponse<unknown>>
          $patch: (params: { json: UpdateCharacterPayload, param: { id: string } }, options?: RequestOptions) => Promise<RemoteResponse<unknown>>
          bookmark: {
            $post: (params: { param: { id: string } }, options?: RequestOptions) => Promise<RemoteResponse<unknown>>
          }
          like: {
            $post: (params: { param: { id: string } }, options?: RequestOptions) => Promise<RemoteResponse<unknown>>
          }
        }
      }
    }
  }
}

/**
 * Options shared by character service operations.
 */
export interface CharacterServiceOptions {
  /**
   * Cancels the operation before or after remote IO.
   */
  abortSignal?: AbortSignal
}

/**
 * Character domain operations used by controller stores.
 */
export interface CharactersService {
  /** Builds an optimistic local character from a create payload. */
  buildLocal: (userId: string, payload: CreateCharacterPayload) => Character
  /** Fetches and parses the remote character list. */
  fetchRemote: (client: CharactersRemoteClient, params: { all?: boolean }, options?: CharacterServiceOptions) => Promise<Character[]>
  /** Fetches and parses one remote character. */
  fetchRemoteById: (client: CharactersRemoteClient, id: string, options?: CharacterServiceOptions) => Promise<Character>
  /** Creates and parses one remote character. */
  createRemote: (client: CharactersRemoteClient, payload: CreateCharacterPayload, options?: CharacterServiceOptions) => Promise<Character>
  /** Updates and parses one remote character. */
  updateRemote: (client: CharactersRemoteClient, id: string, payload: UpdateCharacterPayload, options?: CharacterServiceOptions) => Promise<Character>
  /** Removes one remote character. */
  removeRemote: (client: CharactersRemoteClient, id: string, options?: CharacterServiceOptions) => Promise<void>
  /** Likes and parses one remote character. */
  likeRemote: (client: CharactersRemoteClient, id: string, options?: CharacterServiceOptions) => Promise<Character>
  /** Bookmarks and parses one remote character. */
  bookmarkRemote: (client: CharactersRemoteClient, id: string, options?: CharacterServiceOptions) => Promise<Character>
}

/**
 * Creates the character service facade consumed by controller stores.
 *
 * Use when:
 * - Wiring controller stores to character domain operations.
 * - Tests need to replace the whole service surface with one mock object.
 *
 * Expects:
 * - No runtime dependencies are required yet.
 *
 * Returns:
 * - A stable object containing character domain operations.
 */
export function createCharactersService(): CharactersService {
  function requestOptions(options?: CharacterServiceOptions): RequestOptions | undefined {
    return options?.abortSignal ? { init: { signal: options.abortSignal } } : undefined
  }

  function parse(value: unknown): Character {
    return parseValibot(CharacterWithRelationsSchema, value)
  }

  function buildLocal(userId: string, payload: CreateCharacterPayload): Character {
    const id = payload.character.id ?? nanoid()
    const now = new Date()

    return parseValibot(CharacterWithRelationsSchema, {
      id,
      version: payload.character.version,
      coverUrl: payload.character.coverUrl,
      avatarUrl: undefined,
      characterAvatarUrl: undefined,
      coverBackgroundUrl: undefined,
      creatorRole: undefined,
      priceCredit: '0',
      likesCount: 0,
      bookmarksCount: 0,
      interactionsCount: 0,
      forksCount: 0,
      creatorId: userId,
      ownerId: userId,
      characterId: payload.character.characterId,
      createdAt: now,
      updatedAt: now,
      deletedAt: undefined,
      capabilities: payload.capabilities?.map(capability => ({
        id: nanoid(),
        characterId: id,
        type: capability.type,
        config: capability.config,
      })),
      avatarModels: payload.avatarModels?.map(model => ({
        id: nanoid(),
        characterId: id,
        name: model.name,
        type: model.type,
        description: model.description,
        config: model.config,
        createdAt: now,
        updatedAt: now,
      })),
      i18n: payload.i18n?.map(item => ({
        id: nanoid(),
        characterId: id,
        language: item.language,
        name: item.name,
        description: item.description,
        tags: item.tags,
        createdAt: now,
        updatedAt: now,
      })),
      prompts: payload.prompts?.map(prompt => ({
        id: nanoid(),
        characterId: id,
        language: prompt.language,
        type: prompt.type,
        content: prompt.content,
      })),
      likes: [],
      bookmarks: [],
    })
  }

  async function fetchRemote(client: CharactersRemoteClient, params: { all?: boolean }, options?: CharacterServiceOptions): Promise<Character[]> {
    options?.abortSignal?.throwIfAborted()
    const res = await client.api.v1.characters.$get({
      query: { all: String(params.all ?? false) },
    }, requestOptions(options))
    if (!res.ok)
      throw new Error('Failed to fetch characters')

    const data = await res.json()
    options?.abortSignal?.throwIfAborted()
    return data.map((item: unknown) => parse(item))
  }

  async function fetchRemoteById(client: CharactersRemoteClient, id: string, options?: CharacterServiceOptions): Promise<Character> {
    options?.abortSignal?.throwIfAborted()
    const res = await client.api.v1.characters[':id'].$get({ param: { id } }, requestOptions(options))
    if (!res.ok)
      throw new Error('Failed to fetch character')

    const data = await res.json()
    options?.abortSignal?.throwIfAborted()
    return parse(data)
  }

  async function createRemote(client: CharactersRemoteClient, payload: CreateCharacterPayload, options?: CharacterServiceOptions): Promise<Character> {
    options?.abortSignal?.throwIfAborted()
    const res = await client.api.v1.characters.$post({ json: payload }, requestOptions(options))
    if (!res.ok)
      throw new Error('Failed to create character')

    const data = await res.json()
    options?.abortSignal?.throwIfAborted()
    return parse(data)
  }

  async function updateRemote(client: CharactersRemoteClient, id: string, payload: UpdateCharacterPayload, options?: CharacterServiceOptions): Promise<Character> {
    options?.abortSignal?.throwIfAborted()
    const res = await client.api.v1.characters[':id'].$patch({
      param: { id },
      json: payload,
    }, requestOptions(options))
    if (!res.ok)
      throw new Error('Failed to update character')

    const data = await res.json()
    options?.abortSignal?.throwIfAborted()
    return parse(data)
  }

  async function removeRemote(client: CharactersRemoteClient, id: string, options?: CharacterServiceOptions): Promise<void> {
    options?.abortSignal?.throwIfAborted()
    const res = await client.api.v1.characters[':id'].$delete({ param: { id } }, requestOptions(options))
    if (!res.ok)
      throw new Error('Failed to remove character')
    options?.abortSignal?.throwIfAborted()
  }

  async function likeRemote(client: CharactersRemoteClient, id: string, options?: CharacterServiceOptions): Promise<Character> {
    options?.abortSignal?.throwIfAborted()
    const res = await client.api.v1.characters[':id'].like.$post({ param: { id } }, requestOptions(options))
    if (!res.ok)
      throw new Error('Failed to like character')

    const data = await res.json()
    options?.abortSignal?.throwIfAborted()
    return parse(data)
  }

  async function bookmarkRemote(client: CharactersRemoteClient, id: string, options?: CharacterServiceOptions): Promise<Character> {
    options?.abortSignal?.throwIfAborted()
    const res = await client.api.v1.characters[':id'].bookmark.$post({ param: { id } }, requestOptions(options))
    if (!res.ok)
      throw new Error('Failed to bookmark character')

    const data = await res.json()
    options?.abortSignal?.throwIfAborted()
    return parse(data)
  }

  return {
    buildLocal,
    fetchRemote,
    fetchRemoteById,
    createRemote,
    updateRemote,
    removeRemote,
    likeRemote,
    bookmarkRemote,
  }
}

export const charactersService = createCharactersService()
