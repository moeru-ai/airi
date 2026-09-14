import type { Character, CreateCharacterPayload, UpdateCharacterPayload } from '../types/character'

import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { parse as parseValibot } from 'valibot'
import { ref } from 'vue'

import { LOCAL_USER_ID } from '../constants'
import { charactersModel as model } from '../models/characters'
import { CharacterWithRelationsSchema } from '../types/character'

function setCharactersMap(target: Map<string, Character>, characters: Character[]) {
  target.clear()
  for (const character of characters)
    target.set(character.id, character)
}

/**
 * Builds a local character record from a create payload.
 *
 * Moeka stores characters on the device only, so the generated relation ids
 * and timestamps are the authoritative values for the new record.
 *
 * @example
 * buildLocalCharacter('local', payload)
 * // => { id: 'V1StGXR8_Z5jdHi6B-myT', creatorId: 'local', ... }
 */
function buildLocalCharacter(userId: string, payload: CreateCharacterPayload): Character {
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
    avatarModels: payload.avatarModels?.map(avatarModel => ({
      id: nanoid(),
      characterId: id,
      name: avatarModel.name,
      type: avatarModel.type,
      description: avatarModel.description,
      config: avatarModel.config,
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

/**
 * Owns the device-local character list and its persisted cache.
 *
 * Every mutation writes the in-memory map and the local cache together. The
 * store keeps no network client, so a failed write is a failed cache write.
 */
export const useCharacterStore = defineStore('characters', () => {
  const characters = ref<Map<string, Character>>(new Map())

  /** Replaces the in-memory list with the characters stored on this device. */
  async function fetchList() {
    const stored = await model.list()
    setCharactersMap(characters.value, stored)
    return stored
  }

  async function create(payload: CreateCharacterPayload) {
    const character = buildLocalCharacter(LOCAL_USER_ID, payload)
    characters.value.set(character.id, character)
    await model.upsert(character)
    return character
  }

  async function update(id: string, payload: UpdateCharacterPayload) {
    const character = characters.value.get(id)
    if (!character)
      return

    const nextCharacter = {
      ...character,
      ...(payload.version !== undefined ? { version: payload.version } : {}),
      ...(payload.coverUrl !== undefined ? { coverUrl: payload.coverUrl } : {}),
      ...(payload.characterId !== undefined ? { characterId: payload.characterId } : {}),
      updatedAt: new Date(),
    }
    characters.value.set(nextCharacter.id, nextCharacter)
    await model.upsert(nextCharacter)
    return nextCharacter
  }

  async function remove(id: string) {
    characters.value.delete(id)
    await model.remove(id)
  }

  async function like(id: string) {
    const character = characters.value.get(id)
    if (!character)
      return

    const likes = character.likes ?? []
    if (likes.some(item => item.userId === LOCAL_USER_ID))
      return

    const nextCharacter = {
      ...character,
      likes: [...likes, { userId: LOCAL_USER_ID, characterId: id }],
      likesCount: character.likesCount + 1,
      updatedAt: new Date(),
    }
    characters.value.set(nextCharacter.id, nextCharacter)
    await model.upsert(nextCharacter)
    return nextCharacter
  }

  async function bookmark(id: string) {
    const character = characters.value.get(id)
    if (!character)
      return

    const bookmarks = character.bookmarks ?? []
    if (bookmarks.some(item => item.userId === LOCAL_USER_ID))
      return

    const nextCharacter = {
      ...character,
      bookmarks: [...bookmarks, { userId: LOCAL_USER_ID, characterId: id }],
      bookmarksCount: character.bookmarksCount + 1,
      updatedAt: new Date(),
    }
    characters.value.set(nextCharacter.id, nextCharacter)
    await model.upsert(nextCharacter)
    return nextCharacter
  }

  function getCharacter(id: string) {
    return characters.value.get(id)
  }

  return {
    characters,

    fetchList,
    create,
    update,
    remove,
    like,
    bookmark,
    getCharacter,
  }
})
