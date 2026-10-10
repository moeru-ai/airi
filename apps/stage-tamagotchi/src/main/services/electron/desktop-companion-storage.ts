import type { DesktopCompanionState } from '../../../shared/desktop-companion'
import type { DesktopNotificationStorage } from './desktop-notifications'

import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { parse } from 'valibot'

import { defaultDesktopCompanionState, desktopCompanionStateSchema } from '../../../shared/desktop-companion'

/** Four MiB covers 100 maximum-length previews and 200 IDs, including six-byte JSON escapes for each code unit. */
const maximumStateBytes = 4 * 1024 * 1024

/** Atomic replacement prevents partial JSON after a process interruption. Invalid existing data remains untouched. */
export class DesktopCompanionFileStorage implements DesktopNotificationStorage {
  constructor(private readonly path: string) {}

  load() {
    if (!existsSync(this.path))
      return defaultDesktopCompanionState()
    if (statSync(this.path).size > maximumStateBytes)
      throw new Error('Desktop notification state exceeds its size limit')
    return parse(desktopCompanionStateSchema, JSON.parse(readFileSync(this.path, 'utf8')))
  }

  save(state: DesktopCompanionState) {
    const value = parse(desktopCompanionStateSchema, state)
    const serialized = JSON.stringify(value)
    // Read and write share one byte bound. A successful save must remain loadable after restart.
    if (Buffer.byteLength(serialized, 'utf8') > maximumStateBytes)
      throw new Error('Desktop notification state exceeds its size limit')
    mkdirSync(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.${randomUUID()}.tmp`
    try {
      writeFileSync(temporary, serialized, { mode: 0o600 })
      renameSync(temporary, this.path)
    }
    finally {
      if (existsSync(temporary))
        unlinkSync(temporary)
    }
  }
}
