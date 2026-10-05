import type { IOTraceRecordingState, SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'

import { appendFile, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { errorMessageFrom } from '@moeru/std'
import { Mutex } from 'async-mutex'

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000

interface IOTraceRecordingServiceOptions {
  directory: string
  getStoredEnabled: () => boolean
  setStoredEnabled: (enabled: boolean) => void
}

export class IOTraceRecordingService {
  private readonly listeners = new Set<(state: IOTraceRecordingState) => void>()
  private readonly mutex = new Mutex()
  private filePath: string | undefined
  private error: string | undefined

  constructor(private readonly options: IOTraceRecordingServiceOptions) {}

  getState(): IOTraceRecordingState {
    return {
      directory: this.options.directory,
      enabled: this.filePath !== undefined,
      error: this.error,
      filePath: this.filePath,
    }
  }

  onStateChange(listener: (state: IOTraceRecordingState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async restore(): Promise<void> {
    if (this.options.getStoredEnabled())
      await this.setEnabled(true, false)
  }

  async setEnabled(enabled: boolean, persist = true): Promise<IOTraceRecordingState> {
    return await this.mutex.runExclusive(async () => {
      if (enabled)
        await this.start()
      else
        this.filePath = undefined

      if (persist)
        this.options.setStoredEnabled(enabled)
      const state = this.getState()
      for (const listener of this.listeners)
        listener(state)
      return state
    })
  }

  async recordSpan(span: SerializedIOSpan): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (!this.filePath)
        return
      await appendFile(this.filePath, `${JSON.stringify(span)}\n`, { mode: 0o600 })
    })
  }

  async dispose(): Promise<void> {
    await this.mutex.runExclusive(() => {
      this.filePath = undefined
    })
  }

  private async start(): Promise<void> {
    if (this.filePath)
      return

    try {
      await mkdir(this.options.directory, { mode: 0o700, recursive: true })
      await this.pruneExpiredFiles()
      this.filePath = join(this.options.directory, `${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`)
      this.error = undefined
    }
    catch (error) {
      this.error = errorMessageFrom(error) ?? 'Failed to start IO trace recording.'
      throw error
    }
  }

  private async pruneExpiredFiles(): Promise<void> {
    const cutoff = Date.now() - RETENTION_MS
    for (const name of await readdir(this.options.directory)) {
      if (!name.endsWith('.jsonl'))
        continue
      const path = join(this.options.directory, name)
      if ((await stat(path)).mtimeMs < cutoff)
        await rm(path)
    }
  }
}
