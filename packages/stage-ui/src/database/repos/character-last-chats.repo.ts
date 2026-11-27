import { storage } from '../storage'

/** The chat that was open last with each character, keyed by the character ID. */
export type CharacterLastChats = Record<string, string>

const keyOf = (accountId: string) => `local:chat/last-chats/${accountId}`

/**
 * The chat that was open last with each character. Chats belong to an account, so each account on this device has its
 * own record. See `useCharacterLastChatsStore`.
 */
export const characterLastChatsRepo = {
  async get(accountId: string): Promise<CharacterLastChats> {
    return await storage.getItemRaw<CharacterLastChats>(keyOf(accountId)) ?? {}
  },
  async save(accountId: string, chats: CharacterLastChats) {
    await storage.setItemRaw(keyOf(accountId), { ...chats })
  },
}
