import type { Storage, StorageValue } from 'unstorage'

import type { Character } from '../types/character'

import { storage } from '../database/storage'

const STORAGE_KEY = 'local:characters'

/**
 * Options shared by character model persistence operations.
 */
export interface CharacterModelOptions {
  /**
   * Cancels the operation before local storage IO starts.
   */
  abortSignal?: AbortSignal
}

/**
 * Local persistence boundary for characters.
 */
export interface CharactersModel {
  /**
   * Lists locally persisted characters.
   */
  list: (options?: CharacterModelOptions) => Promise<Character[]>
  /**
   * Replaces the locally persisted character snapshot.
   */
  saveAll: (characters: Character[], options?: CharacterModelOptions) => Promise<void>
  /**
   * Inserts or replaces one locally persisted character by `id`.
   */
  upsert: (character: Character, options?: CharacterModelOptions) => Promise<void>
  /**
   * Removes one locally persisted character by `id`.
   */
  remove: (id: string, options?: CharacterModelOptions) => Promise<void>
}

/**
 * Runtime dependencies required to create the character persistence model.
 */
export interface CreateCharactersModelParams {
  /**
   * Unstorage-compatible backend used for the existing local character snapshot.
   */
  storage: Storage<StorageValue>
}

/**
 * Creates a local persistence boundary for characters.
 *
 * Use when:
 * - Wiring a runtime-specific storage implementation.
 * - Testing character persistence without mocking module imports.
 *
 * Expects:
 * - `params.storage` is an unstorage-compatible storage instance.
 *
 * Returns:
 * - A character model that reads and writes the existing `local:characters` key.
 */
export function createCharactersModel(params: CreateCharactersModelParams): CharactersModel {
  const { storage: store } = params

  async function list(options?: CharacterModelOptions): Promise<Character[]> {
    options?.abortSignal?.throwIfAborted()
    const characters = await store.getItemRaw<Character[]>(STORAGE_KEY) || []
    options?.abortSignal?.throwIfAborted()
    return characters
  }

  async function saveAll(characters: Character[], options?: CharacterModelOptions): Promise<void> {
    options?.abortSignal?.throwIfAborted()
    await store.setItemRaw(STORAGE_KEY, characters)
    options?.abortSignal?.throwIfAborted()
  }

  async function upsert(character: Character, options?: CharacterModelOptions): Promise<void> {
    options?.abortSignal?.throwIfAborted()
    const all = await list(options)
    options?.abortSignal?.throwIfAborted()
    const index = all.findIndex(item => item.id === character.id)

    if (index > -1) {
      all[index] = character
    }
    else {
      all.push(character)
    }

    await saveAll(all, options)
  }

  async function remove(id: string, options?: CharacterModelOptions): Promise<void> {
    options?.abortSignal?.throwIfAborted()
    const all = await list(options)
    options?.abortSignal?.throwIfAborted()
    await saveAll(all.filter(character => character.id !== id), options)
  }

  return {
    list,
    saveAll,
    upsert,
    remove,
  }
}

export const charactersModel = createCharactersModel({ storage })
