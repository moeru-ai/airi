import type { Character } from '../../types/character'

import { storage } from '../storage'

export const charactersRepo = {
  async getAll() {
    return await storage.getItem<Character[]>('local:characters') || []
  },

  async saveAll(characters: Character[]) {
    await storage.setItem('local:characters', characters)
  },

  async upsert(character: Character) {
    const all = await this.getAll()
    const index = all.findIndex(c => c.id === character.id)
    if (index > -1) {
      all[index] = character
    }
    else {
      all.push(character)
    }
    await this.saveAll(all)
  },

  async remove(id: string) {
    const all = await this.getAll()
    await this.saveAll(all.filter(c => c.id !== id))
  },
}
