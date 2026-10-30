import type { IOTraceRecordingState } from '@proj-airi/stage-shared/types/io-trace'
import type { ContentPolicy, TraceRecord } from '@proj-airi/trace-kit'
import type { FlightRecorderDump } from '@proj-airi/trace-kit/collector'

import { appendFile, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

import { errorMessageFrom } from '@moeru/std'
import { applyContentPolicy } from '@proj-airi/trace-kit'
import { Mutex } from 'async-mutex'

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000

interface IOTraceRecordingServiceOptions {
  directory: string
  getStoredEnabled: () => boolean
  setStoredEnabled: (enabled: boolean) => void
  /**
   * The sensitivity of an attribute key. Files remove `content` and `secret` attributes.
   * @default every key counts as `none`
   */
  sensitivityOf?: ContentPolicy['sensitivityOf']
}

/** Files keep timing, counts, and IDs. User content stays in the live buffer only. */
const FILE_KEEPS_CONTENT = false

function fileName(prefix: string): string {
  return `${prefix}${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`
}

/**
 * Writes trace records as JSON Lines, one record for each line.
 *
 * State model:
 * - Persisted setting: `enabled`, through the injected getter and setter.
 * - Runtime state: `filePath` is the file of the current recording. A new file starts each time recording starts.
 * - Flight dumps go to their own files, also while recording is off. A dump that overlaps the previous dump appends to
 *   the previous file.
 * - Files older than seven days go when recording starts and when a new flight dump file starts.
 *
 * One mutex orders every write, so lines of two writers never interleave.
 */

export class IOTraceRecordingService {
  private readonly listeners = new Set<(state: IOTraceRecordingState) => void>()
  private readonly mutex = new Mutex()
  private filePath: string | undefined
  private flightFilePath: string | undefined
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

  async recordRecord(record: TraceRecord): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (!this.filePath)
        return
      await appendFile(this.filePath, `${JSON.stringify(this.forFile(record))}\n`, { mode: 0o600 })
    })
  }

  /** Writes the records of a flight recorder dump, also while recording is off. */
  async writeFlightDump(dump: FlightRecorderDump): Promise<void> {
    await this.mutex.runExclusive(async () => {
      await mkdir(this.options.directory, { mode: 0o700, recursive: true })
      if (!dump.append || !this.flightFilePath) {
        // Dumps also come while recording is off, so a new dump file removes expired files too.
        await this.pruneExpiredFiles()
        this.flightFilePath = join(this.options.directory, fileName(`flight-${dump.reason}-`))
      }
      const lines = dump.records.map(record => `${JSON.stringify(this.forFile(record))}\n`).join('')
      await appendFile(this.flightFilePath, lines, { mode: 0o600 })
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
      this.filePath = join(this.options.directory, fileName(''))
      this.error = undefined
    }
    catch (error) {
      this.error = errorMessageFrom(error) ?? 'Failed to start IO trace recording.'
      throw error
    }
  }

  private forFile(record: TraceRecord): TraceRecord {
    return applyContentPolicy(record, { keepContent: FILE_KEEPS_CONTENT, sensitivityOf: this.options.sensitivityOf ?? (() => undefined) })
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
