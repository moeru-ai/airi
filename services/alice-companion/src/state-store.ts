import type { AuditEntry, CompanionState } from './contracts'

import process from 'node:process'

import { appendFile, copyFile, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { errorMessageFrom } from '@moeru/std'
import { safeParse } from 'valibot'

import { CompanionStateSchema } from './contracts'

/**
 * File storage of the companion state. It is the filesystem boundary of the service.
 *
 * Files in `dataDir`:
 * - `state.json`: the current state. Always replaced with a rename, so a crash leaves the old or the new file.
 * - `state.json.bak`: the state before the last write. Restore it by copying it over `state.json`.
 * - `audit.jsonl`: one line per decision, append only.
 * - `companion.lock`: the PID of the running service. Two services on one data directory would split the authority.
 */
export class StateStore {
  private readonly statePath: string
  private readonly backupPath: string
  private readonly auditPath: string
  private readonly lockPath: string
  private lockHeld = false

  constructor(private readonly dataDir: string) {
    this.statePath = join(dataDir, 'state.json')
    this.backupPath = join(dataDir, 'state.json.bak')
    this.auditPath = join(dataDir, 'audit.jsonl')
    this.lockPath = join(dataDir, 'companion.lock')
  }

  /**
   * Takes the single-writer lock. A lock left by a process that no longer runs is taken over.
   * Throws when another live process holds it.
   */
  async acquireLock(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true })
    try {
      await this.createLockFile()
    }
    catch (error) {
      if (!isAlreadyExists(error))
        throw error
      const owner = Number.parseInt(await readFile(this.lockPath, 'utf8'), 10)
      if (Number.isInteger(owner) && isProcessAlive(owner))
        throw new Error(`Another companion service (PID ${owner}) uses ${this.dataDir}`)
      await rm(this.lockPath, { force: true })
      await this.createLockFile()
    }
    this.lockHeld = true
  }

  async releaseLock(): Promise<void> {
    if (!this.lockHeld)
      return
    await rm(this.lockPath, { force: true })
    this.lockHeld = false
  }

  /**
   * Returns the stored state, or `undefined` when no state file exists yet.
   * Throws when the file exists but is not valid, so that a damaged file is never replaced by an empty state.
   */
  async load(): Promise<CompanionState | undefined> {
    let raw: string
    try {
      raw = await readFile(this.statePath, 'utf8')
    }
    catch (error) {
      if (isNotFound(error))
        return undefined
      throw error
    }

    let json: unknown
    try {
      json = JSON.parse(raw)
    }
    catch (error) {
      throw new Error(`${this.statePath} is not valid JSON: ${errorMessageFrom(error) ?? 'unknown error'}. Restore ${this.backupPath}.`)
    }

    const result = safeParse(CompanionStateSchema, json)
    if (!result.success) {
      const issue = result.issues[0]
      throw new Error(`${this.statePath} does not match the state schema: ${issue.message}. Restore ${this.backupPath}.`)
    }
    return result.output
  }

  async save(state: CompanionState): Promise<void> {
    const temporaryPath = `${this.statePath}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    try {
      await copyFile(this.statePath, this.backupPath)
    }
    catch (error) {
      // The first save has no previous state to back up.
      if (!isNotFound(error))
        throw error
    }
    await rename(temporaryPath, this.statePath)
  }

  async appendAudit(entry: AuditEntry): Promise<void> {
    await appendFile(this.auditPath, `${JSON.stringify(entry)}\n`, 'utf8')
  }

  private async createLockFile(): Promise<void> {
    // `wx` fails when the file exists, so two processes cannot both create it.
    const handle = await open(this.lockPath, 'wx')
    try {
      await handle.writeFile(String(process.pid), 'utf8')
    }
    finally {
      await handle.close()
    }
  }
}

function errorCode(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined
}

function isNotFound(error: unknown): boolean {
  return errorCode(error) === 'ENOENT'
}

function isAlreadyExists(error: unknown): boolean {
  return errorCode(error) === 'EEXIST'
}

function isProcessAlive(pid: number): boolean {
  try {
    // Signal 0 checks that the process exists without sending a signal.
    process.kill(pid, 0)
    return true
  }
  catch (error) {
    // EPERM: the process exists but belongs to another user.
    return errorCode(error) === 'EPERM'
  }
}
