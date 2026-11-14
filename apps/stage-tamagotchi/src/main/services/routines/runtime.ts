import type { Proposal } from '@proj-airi/stage-ui/libs/routines/contracts'
import type { RoutineState } from '@proj-airi/stage-ui/libs/routines/model'
import type { Occurrence } from '@proj-airi/stage-ui/libs/routines/schedule'

import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'

import { changeSchema, commandSchema } from '@proj-airi/stage-ui/libs/routines/contracts'
import { emptyState, stateSchema } from '@proj-airi/stage-ui/libs/routines/model'
import { localDate, occurrencesOverlap, querySchedule } from '@proj-airi/stage-ui/libs/routines/schedule'

import * as v from 'valibot'

/**
 * Owns one profile's durable routine state. All commands and delivery claims run through one serial queue.
 * A failed write leaves the in-memory snapshot unchanged. Corrupt files fail closed and are never replaced automatically.
 */
export class RoutineRuntime {
  private state = emptyState()
  private loaded = false
  private storageError: string | null = null
  private disposed = false
  private queue: Promise<unknown> = Promise.resolve()
  private proposals: Proposal[] = []

  constructor(private readonly root: string) {}

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(() => {
      if (this.disposed)
        throw new Error('routine-runtime-stopped')
      if (this.storageError)
        throw new Error(this.storageError)
      return operation()
    })
    this.queue = next.catch(() => {})
    return next
  }

  async load(): Promise<void> {
    return this.serial(async () => {
      if (this.loaded)
        return
      await mkdir(this.root, { recursive: true, mode: 0o700 })
      if ((await lstat(this.root)).isSymbolicLink())
        throw new Error('symlink-store-refused')
      let file
      try {
        file = await open(join(this.root, 'state.json'), constants.O_RDONLY | constants.O_NOFOLLOW)
      }
      catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT')
          throw error
      }
      if (file) {
        try {
          const info = await file.stat()
          if (!info.isFile() || info.size > 2097152)
            throw new Error('invalid-state-file')
          this.state = v.parse(stateSchema, JSON.parse(await file.readFile('utf8')))
        }
        finally {
          await file.close()
        }
      }
      this.loaded = true
    })
  }

  private async persist(candidate: RoutineState) {
    if (!this.loaded)
      throw new Error('routine-runtime-not-loaded')
    const state = v.parse(stateSchema, candidate)
    const temporary = join(this.root, `${randomUUID()}.tmp`)
    const file = await open(temporary, 'wx', 0o600)
    try {
      await file.writeFile(JSON.stringify(state), 'utf8')
      await file.sync()
      await file.close()
      await rename(temporary, join(this.root, 'state.json'))
      // Rename commits the snapshot. A later sync failure cannot roll it back.
      this.state = state
      const directory = await open(this.root, constants.O_RDONLY)
      try {
        await directory.sync()
      }
      finally {
        await directory.close()
      }
    }
    catch (error) {
      if (this.state === state)
        this.storageError = 'durability-unconfirmed'
      await file.close().catch(() => {})
      await unlink(temporary).catch(() => {})
      throw error
    }
    this.state = state
    return structuredClone(state)
  }

  async read(now = Date.now()) {
    await this.queue
    if (!this.loaded || this.disposed)
      throw new Error('routine-runtime-unavailable')
    return {
      storageError: this.storageError,
      state: structuredClone(this.state),
      schedule: querySchedule(this.state, now),
      proposals: structuredClone(this.proposals.filter(item => item.expiresAt > now)),
    }
  }

  /** User-interface commands validate an expected revision before replacing the complete snapshot. */
  async apply(input: unknown): Promise<RoutineState> {
    const command = v.parse(commandSchema, input)
    return this.serial(async () => {
      if (command.expectedRevision !== this.state.revision)
        throw new Error('stale-revision')
      const next = structuredClone(this.state)
      if (command.kind === 'save') {
        if (next.routine && next.routine.id !== command.routine.id && !command.replace)
          throw new Error('replacement-confirmation-required')
        next.routine = { ...command.routine, reviewed: false, shortSleepAcknowledged: false, enabled: false, remindersEnabled: false }
        if (command.replace || !this.state.routine) {
          next.completions = []
          next.overrides = []
          next.mutedDate = null
        }
        else {
          const ids = new Set(next.routine.activities.map(item => item.id))
          next.completions = next.completions.filter(item => ids.has(item.activityId))
          // Editing the recurring plan invalidates dated timing overrides.
          next.overrides = []
        }
      }
      else if (command.kind === 'delete') {
        Object.assign(next, emptyState())
      }
      else {
        if (!next.routine)
          throw new Error('routine-required')
        if (command.kind === 'pause') {
          next.routine.pausedUntil = command.until
        }
        else {
          const { kind: _kind, expectedRevision: _revision, ...settings } = command
          Object.assign(next.routine, settings)
        }
      }
      next.revision = this.state.revision + 1
      return this.persist(next)
    })
  }

  async propose(input: unknown, now = Date.now()): Promise<Proposal> {
    const change = v.parse(changeSchema, input)
    return this.serial(async () => {
      if (!this.loaded || !this.state.routine)
        throw new Error('routine-required')
      if (change.kind !== 'mute-today' && !querySchedule(this.state, now).occurrences.some(item => item.activityId === change.activityId && item.date === change.date))
        throw new Error('occurrence-unavailable')
      this.proposals = this.proposals.filter(item => item.expiresAt > now).slice(-19)
      const proposal = { id: randomUUID(), revision: this.state.revision, expiresAt: now + 300000, proposedDate: localDate(now, this.state.routine.timeZone), change }
      this.proposals.push(proposal)
      return structuredClone(proposal)
    })
  }

  /** Only the UI invokes this method, after presenting the complete immutable proposal. */
  async confirm(proposalId: string, now = Date.now()): Promise<RoutineState> {
    return this.serial(async () => {
      const proposal = this.proposals.find(item => item.id === proposalId)
      if (!proposal || proposal.expiresAt <= now)
        throw new Error('expired-proposal')
      if (proposal.revision !== this.state.revision)
        throw new Error('stale-revision')
      const next = structuredClone(this.state)
      const routine = next.routine
      if (!routine)
        throw new Error('routine-required')
      const change = proposal.change
      if (change.kind === 'mute-today') {
        if (proposal.proposedDate !== localDate(now, routine.timeZone))
          throw new Error('expired-local-day')
        next.mutedDate = localDate(now, routine.timeZone)
      }
      else {
        const occurrence = querySchedule(next, now).occurrences.find(item => item.activityId === change.activityId && item.date === change.date)
        if (!occurrence)
          throw new Error('occurrence-unavailable')
        if (change.kind === 'complete') {
          if (occurrence.startAt > now)
            throw new Error('future-completion-refused')
          if (!next.completions.some(item => item.activityId === change.activityId && item.date === change.date))
            next.completions.push({ activityId: change.activityId, date: change.date, completedAt: now })
        }
        else {
          if (change.date !== localDate(now, routine.timeZone))
            throw new Error('postpone-today-only')
          const activity = routine.activities.find(item => item.id === change.activityId)!
          const duration = (activity.end - activity.start + 1440) % 1440
          const item = { activityId: change.activityId, date: change.date, start: change.start, end: (change.start + duration) % 1440 }
          next.overrides = next.overrides.filter(item => item.activityId !== change.activityId || item.date !== change.date)
          next.overrides.push(item)
          const updated = querySchedule(next, now).occurrences.find(item => item.activityId === change.activityId && item.date === change.date)
          if (!updated || updated.startAt <= now || updated.startAt <= occurrence.startAt)
            throw new Error('postpone-must-be-later')
          if (occurrencesOverlap(next, now))
            throw new Error('overlap')
        }
      }
      next.revision++
      const saved = await this.persist(next)
      this.proposals = this.proposals.filter(item => item.id !== proposalId)
      return saved
    })
  }

  /**
   * Claims before display for at-most-once attempts. Missed reminders older than sixty seconds are skipped after resume.
   * Display failure or a crash after the durable claim can lose a reminder. It never triggers a duplicate retry.
   */
  async tick(now: number, emit: (occurrence: Occurrence) => void | Promise<void>): Promise<void> {
    return this.serial(async () => {
      const routine = this.state.routine
      if (!this.loaded || !routine?.enabled || !routine.remindersEnabled || routine.pausedUntil > now || this.state.mutedDate === localDate(now, routine.timeZone))
        return
      const due = querySchedule(this.state, now).occurrences.filter((item) => {
        const dueAt = item.startAt - routine.advanceMinutes * 60000
        return item.status === 'planned' && dueAt >= this.state.deliveryWatermark && dueAt <= now && now - dueAt < 60000 && (routine.advanceMinutes === 0 ? item.endAt > now : item.startAt > now)
      })
      for (const item of due) {
        const key = `${routine.id}:${item.activityId}:${item.date}`
        if (this.state.deliveries.includes(key))
          continue
        const next = structuredClone(this.state)
        next.deliveries = [...next.deliveries, key].slice(-4096)
        // Retired keys cannot replay after clock rollback. Equal timestamps retain all simultaneous claims.
        next.deliveryWatermark = Math.max(next.deliveryWatermark, item.startAt - routine.advanceMinutes * 60000)
        next.revision++
        await this.persist(next)
        if (!this.disposed)
          await emit(item)
      }
    })
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.proposals = []
    await this.queue
  }
}
