import type { TextJournalEntry } from '../../types/text-journal'

import { storage } from '../storage'

export const textJournalRepo = {
  async getAll(userId: string) {
    const key = `local:memory/text-journal/${userId}`
    return await storage.getItemRaw<TextJournalEntry[]>(key)
  },

  async saveAll(userId: string, entries: TextJournalEntry[]) {
    const key = `local:memory/text-journal/${userId}`
    await storage.setItemRaw(key, entries)
  },
}
