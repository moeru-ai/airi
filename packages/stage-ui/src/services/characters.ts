import type { Character, CreateCharacterPayload, UpdateCharacterPayload } from '../types/character'

import { nanoid } from 'nanoid'
import { parse as parseValibot } from 'valibot'

import { CharacterWithRelationsSchema } from '../types/character'

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
 * Character domain operations used by controller stores.
 */
export interface CharactersService {
  /** Bookmarks and parses one remote character. */
  bookmarkRemote: (client: CharactersRemoteClient, id: string, options?: CharacterServiceOptions) => Promise<Character>
  /** Builds an optimistic local character from a create payload. */
  buildLocal: (userId: string, payload: CreateCharacterPayload) => Character
  /** Creates and parses one remote character. */
  createRemote: (client: CharactersRemoteClient, payload: CreateCharacterPayload, options?: CharacterServiceOptions) => Promise<Character>
  /** Fetches and parses the remote character list. */
  fetchRemote: (client: CharactersRemoteClient, params: { all?: boolean }, options?: CharacterServiceOptions) => Promise<Character[]>
  /** Fetches and parses one remote character. */
  fetchRemoteById: (client: CharactersRemoteClient, id: string, options?: CharacterServiceOptions) => Promise<Character>
  /** Likes and parses one remote character. */
  likeRemote: (client: CharactersRemoteClient, id: string, options?: CharacterServiceOptions) => Promise<Character>
  /** Removes one remote character. */
  removeRemote: (client: CharactersRemoteClient, id: string, options?: CharacterServiceOptions) => Promise<void>
  /** Updates and parses one remote character. */
  updateRemote: (client: CharactersRemoteClient, id: string, payload: UpdateCharacterPayload, options?: CharacterServiceOptions) => Promise<Character>
}

interface RemoteResponse<T> {
  json: () => Promise<T>
  ok: boolean
}

interface RequestOptions {
  init: { signal: AbortSignal }
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
      avatarModels: payload.avatarModels?.map(model => ({
        characterId: id,
        config: model.config,
        createdAt: now,
        description: model.description,
        id: nanoid(),
        name: model.name,
        type: model.type,
        updatedAt: now,
      })),
      avatarUrl: undefined,
      bookmarks: [],
      bookmarksCount: 0,
      capabilities: payload.capabilities?.map(capability => ({
        characterId: id,
        config: capability.config,
        id: nanoid(),
        type: capability.type,
      })),
      characterAvatarUrl: undefined,
      characterId: payload.character.characterId,
      coverBackgroundUrl: undefined,
      coverUrl: payload.character.coverUrl,
      createdAt: now,
      creatorId: userId,
      creatorRole: undefined,
      deletedAt: undefined,
      forksCount: 0,
      i18n: payload.i18n?.map(item => ({
        characterId: id,
        createdAt: now,
        description: item.description,
        id: nanoid(),
        language: item.language,
        name: item.name,
        tags: item.tags,
        updatedAt: now,
      })),
      id,
      interactionsCount: 0,
      likes: [],
      likesCount: 0,
      ownerId: userId,
      priceCredit: '0',
      prompts: payload.prompts?.map(prompt => ({
        characterId: id,
        content: prompt.content,
        id: nanoid(),
        language: prompt.language,
        type: prompt.type,
      })),
      updatedAt: now,
      version: payload.character.version,
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
      json: payload,
      param: { id },
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
    bookmarkRemote,
    buildLocal,
    createRemote,
    fetchRemote,
    fetchRemoteById,
    likeRemote,
    removeRemote,
    updateRemote,
  }
}

export const charactersService = createCharactersService()
