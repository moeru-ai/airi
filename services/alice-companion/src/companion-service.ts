import type { AffectUpdated, CompanionPolicy, CompanionSnapshot, ReduceResult } from './companion-state'
import type { CompanionEvent, CompanionState } from './contracts'
import type { StateStore } from './state-store'

import { useLogger } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'

import { createInitialState, describeAffect, describeState, reduceCompanionState } from './companion-state'

/** Output side of the service. The MQTT gateway implements it. */
export interface CompanionPublisher {
  publishState: (snapshot: CompanionSnapshot) => Promise<void>
  publishAffect: (affect: AffectUpdated) => Promise<void>
}

export interface CompanionServiceOptions {
  store: StateStore
  publisher: CompanionPublisher
  policy: CompanionPolicy
  personaId: string
  ownerProfileId: string
  now: () => Date
  /**
   * Interval for publishing the state again without a new event, so that readers see
   * energy recovery and the date change.
   * @default 600000
   */
  refreshIntervalMs?: number
}

const log = useLogger('alice-companion')

/**
 * Owner of the in-memory companion state.
 *
 * State model:
 * - `state` is the last state that was saved to disk. It is `undefined` before `start()`.
 * - Every event runs through one promise queue, so two MQTT messages never interleave
 *   a read, a reduce, and a write.
 * - A new state replaces `state` only after `store.save()` succeeds. A failed save keeps the old state.
 * - Publishing happens after the save. A failed publish is logged and the state stays saved.
 */
export class CompanionService {
  private state: CompanionState | undefined
  private queue: Promise<void> = Promise.resolve()
  private refreshTimer: ReturnType<typeof setInterval> | undefined

  constructor(private readonly options: CompanionServiceOptions) {}

  /** Loads or creates the state, publishes it, and starts the refresh timer. Call it once. */
  async start(): Promise<void> {
    if (this.state)
      throw new Error('CompanionService.start() was already called')

    const loaded = await this.options.store.load()
    if (loaded && loaded.personaId !== this.options.personaId)
      throw new Error(`The state file belongs to persona "${loaded.personaId}", not "${this.options.personaId}"`)

    if (loaded) {
      this.state = loaded
    }
    else {
      const initial = createInitialState({ personaId: this.options.personaId, ownerProfileId: this.options.ownerProfileId, at: this.options.now() })
      await this.options.store.save(initial)
      this.state = initial
    }

    await this.publishSnapshot()
    this.refreshTimer = setInterval(() => {
      void this.publishSnapshot()
    }, this.options.refreshIntervalMs ?? 600_000)
  }

  /** Stops the refresh timer and waits for queued events. Events that arrive later are still queued. */
  async stop(): Promise<void> {
    clearInterval(this.refreshTimer)
    this.refreshTimer = undefined
    await this.queue
  }

  /** Queues one validated event. Resolves with the reducer outcome after the save and the publish. */
  handle(event: CompanionEvent): Promise<ReduceResult['outcome']> {
    return this.enqueue(async () => {
      const current = this.requireState()
      const result = reduceCompanionState(current, event, this.options.policy)
      if (result.outcome === 'duplicate')
        return result.outcome

      await this.options.store.save(result.state)
      this.state = result.state
      if (result.audit)
        await this.options.store.appendAudit(result.audit)

      if (result.outcome === 'applied') {
        const snapshot = describeState(result.state, this.options.now(), this.options.policy)
        await this.publishSafely(() => this.options.publisher.publishState(snapshot))
        if (result.affectChanged)
          await this.publishSafely(() => this.options.publisher.publishAffect(describeAffect(snapshot)))
      }
      return result.outcome
    })
  }

  /** Publishes the current state again. Used on connect, on the `get` command, and by the refresh timer. */
  publishSnapshot(): Promise<void> {
    return this.enqueue(async () => {
      const snapshot = describeState(this.requireState(), this.options.now(), this.options.policy)
      await this.publishSafely(() => this.options.publisher.publishState(snapshot))
    })
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task)
    // The queue continues after a failed task. The caller still receives the failure through `run`.
    this.queue = run.then(() => undefined, () => undefined)
    return run
  }

  private requireState(): CompanionState {
    if (!this.state)
      throw new Error('CompanionService is not started')
    return this.state
  }

  private async publishSafely(publish: () => Promise<void>): Promise<void> {
    try {
      await publish()
    }
    catch (error) {
      log.withError(error).warn(`Publish failed: ${errorMessageFrom(error) ?? 'unknown error'}`)
    }
  }
}
