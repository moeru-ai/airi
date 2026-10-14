import { errorMessageFrom } from '@moeru/std'

export type TransferTaskStatus = 'queued' | 'running' | 'failed'

export interface TransferTask<TPayload = unknown> {
  id: string
  /** Selects the handler. */
  kind: string
  /** The account that owns the transfer. */
  ownerId: string
  payload: TPayload
  status: TransferTaskStatus
  error?: string
}

export interface TransferTaskStorage {
  save: (task: TransferTask) => Promise<void>
  remove: (id: string) => Promise<void>
  list: () => Promise<TransferTask[]>
}

export type TransferTaskHandler = (task: TransferTask, signal: AbortSignal) => Promise<void>

/**
 * Durable, account-scoped queue for file transfers. It runs one task at a time.
 *
 * Use when:
 * - A feature uploads or downloads files and must resume after a restart.
 *
 * Expects:
 * - One handler per task kind. A handler that resolves completes the task.
 * - `activate` is called with the current account. `deactivate` is called on logout or account switch.
 *
 * Returns:
 * - Task state through `onChange`. A handler that rejects marks the task failed until `retry`.
 *   Results of tasks that finish after `deactivate` are discarded.
 */
export class TransferQueue {
  private tasks = new Map<string, TransferTask>()
  private controllers = new Map<string, AbortController>()
  private ownerId: string | undefined
  private generation = 0
  private running = false

  constructor(
    private readonly handlers: Record<string, TransferTaskHandler>,
    private readonly storage: TransferTaskStorage,
    private readonly onChange: (task: TransferTask, removed: boolean) => void = () => {},
  ) {}

  /** Loads persisted tasks of the account and starts them. */
  async activate(ownerId: string) {
    this.deactivate()
    this.ownerId = ownerId
    const generation = this.generation
    const stored = (await this.storage.list()).filter(task => task.ownerId === ownerId)
    if (generation !== this.generation)
      return
    for (const task of stored)
      this.track({ ...task, status: task.status === 'failed' ? 'failed' : 'queued' })
    void this.drain()
  }

  /** Aborts running transfers and forgets in-memory state. Persisted tasks stay for the next `activate`. */
  deactivate() {
    this.generation++
    for (const controller of this.controllers.values())
      controller.abort()
    this.controllers.clear()
    for (const task of this.tasks.values())
      this.onChange(task, true)
    this.tasks.clear()
    this.ownerId = undefined
    this.running = false
  }

  async enqueue(input: Pick<TransferTask, 'id' | 'kind' | 'payload'>) {
    if (!this.ownerId)
      throw new Error('The transfer queue has no active account')
    const task: TransferTask = { ...input, ownerId: this.ownerId, status: 'queued' }
    await this.storage.save(task)
    this.track(task)
    void this.drain()
  }

  async cancel(id: string) {
    this.controllers.get(id)?.abort()
    const task = this.tasks.get(id)
    this.tasks.delete(id)
    if (task)
      this.onChange(task, true)
    await this.storage.remove(id)
  }

  async retry(id: string) {
    const task = this.tasks.get(id)
    if (!task || task.status !== 'failed')
      return
    this.track({ ...task, status: 'queued', error: undefined })
    await this.storage.save(this.tasks.get(id)!)
    void this.drain()
  }

  private track(task: TransferTask) {
    this.tasks.set(task.id, task)
    this.onChange(task, false)
  }

  private async drain() {
    if (this.running)
      return
    this.running = true
    const generation = this.generation
    try {
      for (let next = this.nextQueued(); next && generation === this.generation; next = this.nextQueued())
        await this.run(next, generation)
    }
    finally {
      if (generation === this.generation)
        this.running = false
    }
  }

  private nextQueued() {
    return Array.from(this.tasks.values()).find(task => task.status === 'queued')
  }

  private async run(task: TransferTask, generation: number) {
    const controller = new AbortController()
    this.controllers.set(task.id, controller)
    this.track({ ...task, status: 'running' })
    try {
      await this.handlers[task.kind](task, controller.signal)
      if (generation !== this.generation || this.tasks.get(task.id)?.status !== 'running')
        return
      this.tasks.delete(task.id)
      this.onChange(task, true)
      await this.storage.remove(task.id)
    }
    catch (error) {
      if (generation !== this.generation || controller.signal.aborted)
        return
      const failed: TransferTask = { ...task, status: 'failed', error: errorMessageFrom(error) ?? 'Transfer failed' }
      this.track(failed)
      await this.storage.save(failed)
    }
    finally {
      this.controllers.delete(task.id)
    }
  }
}
