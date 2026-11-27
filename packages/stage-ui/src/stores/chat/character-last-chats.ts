import type { CharacterLastChats } from '../../database/repos/character-last-chats.repo'

import { errorMessageFrom } from '@moeru/std'
import { defineStore } from 'pinia'

import { characterLastChatsRepo } from '../../database/repos/character-last-chats.repo'
import { useAuthStore } from '../auth'
import { useAiriCardStore } from '../modules/airi-card'
import { useChatSessionStore } from './session-store'

/**
 * The chat that was open last with each character. A pick of a character can open it again, so a switch to another
 * character and back returns to the chat that the user left.
 *
 * - Persisted state: one record for each account in IndexedDB, through `characterLastChatsRepo`. It lasts across
 *   restarts.
 * - Cache state: the record of each account, read on its first use and then kept. Quick writes change the same object,
 *   so one write cannot drop another. The store does not synchronize between windows, so one window at a time writes.
 * - The record follows the character cards: each write drops the chats of the characters whose cards are gone.
 *
 * The index session of the character stays as it is. Other windows, voice input, and wake words still use it.
 */
export const useCharacterLastChatsStore = defineStore('character-last-chats', () => {
  const authStore = useAuthStore()
  const chatSession = useChatSessionStore()
  const cardStore = useAiriCardStore()
  const records = new Map<string, Promise<CharacterLastChats>>()

  function accountId() {
    return authStore.userId || 'local'
  }

  function recordOf(account: string) {
    let record = records.get(account)
    if (!record) {
      record = characterLastChatsRepo.get(account).catch((error) => {
        console.warn('[character-last-chats] Failed to read the last chats of the characters:', errorMessageFrom(error) ?? 'unknown')
        return {}
      })
      records.set(account, record)
    }
    return record
  }

  /** The last chat of a character, or undefined. The caller checks that the chat still exists and opens on its own. */
  async function lastChatOf(characterId: string) {
    return (await recordOf(accountId()))[characterId]
  }

  /**
   * Makes a chat the last chat of its character. Before the cards load, the card map can miss cards, so the write
   * drops no chat then.
   */
  async function remember(sessionId: string) {
    const [characterId] = chatSession.characterMembersOf(sessionId)
    if (!characterId)
      return
    const account = accountId()
    const chats = await recordOf(account)
    chats[characterId] = sessionId
    if (cardStore.ready) {
      for (const id of Object.keys(chats)) {
        if (!cardStore.cards.has(id))
          delete chats[id]
      }
    }
    try {
      await characterLastChatsRepo.save(account, chats)
    }
    catch (error) {
      console.warn('[character-last-chats] Failed to save the last chats of the characters:', errorMessageFrom(error) ?? 'unknown')
    }
  }

  return { lastChatOf, remember }
})
