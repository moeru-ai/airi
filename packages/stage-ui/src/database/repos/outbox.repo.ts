import type { OutboxItem } from '../../composables/use-outbox-queue'

import { storage } from '../storage'

const OUTBOX_KEY = 'outbox:queue'

export const outboxRepo = {
  async getAll() {
    return await storage.getItem<OutboxItem[]>(OUTBOX_KEY) || []
  },

  async saveAll(items: OutboxItem[]) {
    await storage.setItem(OUTBOX_KEY, items)
  },

  async enqueue(item: OutboxItem) {
    const all = await this.getAll()
    all.push(item)
    await this.saveAll(all)
  },

  async upsert(item: OutboxItem) {
    const all = await this.getAll()
    const index = all.findIndex(existing => existing.id === item.id)
    if (index > -1) {
      all[index] = item
    }
    else {
      all.push(item)
    }
    await this.saveAll(all)
  },

  async remove(id: string) {
    const all = await this.getAll()
    await this.saveAll(all.filter(item => item.id !== id))
  },
}
