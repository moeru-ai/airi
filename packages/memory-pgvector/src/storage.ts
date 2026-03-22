import type { MemoryRecord } from '@proj-airi/server-sdk'

import type { MemoryStoreState } from './types.js'

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export class MemoryFileStore {
  private filePath: string
  private state: MemoryStoreState = { version: 1, items: [] }
  private saveQueue: Promise<void> = Promise.resolve()

  constructor(filePath: string) {
    this.filePath = filePath
  }

  async reconfigure(filePath: string) {
    if (this.filePath === filePath) {
      return
    }

    this.filePath = filePath
    await this.load()
  }

  async load() {
    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<MemoryStoreState>

      this.state = {
        version: 1,
        items: Array.isArray(parsed.items) ? parsed.items as MemoryRecord[] : [],
      }
    }
    catch (error) {
      const nodeError = error as NodeJS.ErrnoException
      if (nodeError.code !== 'ENOENT') {
        throw error
      }

      this.state = { version: 1, items: [] }
      await this.save()
    }
  }

  getAll(): MemoryRecord[] {
    return this.state.items
  }

  replaceAll(items: MemoryRecord[]) {
    this.state.items = items
    return this.save()
  }

  private async persist() {
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(this.state, null, 2), 'utf8')
  }

  save() {
    this.saveQueue = this.saveQueue.then(() => this.persist(), () => this.persist())
    return this.saveQueue
  }
}
