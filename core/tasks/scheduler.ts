/**
 * AIRI Core — Task Scheduler
 *
 * Dispatches queued tasks to executors based on priority and concurrency limits.
 *
 * Design decisions:
 * - Priority-first ordering: critical > high > normal > low.
 * - FIFO within same priority level.
 * - Concurrency limit (configurable, default 4).
 * - Starvation prevention: tasks waiting longer than the threshold get a priority boost.
 * - In-process only — no external queue systems.
 * - Works with TaskManager: scheduler picks tasks, manager handles state.
 */

import type { EventBus } from '../events/bus.js'
import type { Logger } from '../logger.js'
import type { Task } from './types.js'
import { PRIORITY_WEIGHTS } from './types.js'
import type { TaskManager } from './manager.js'
import type { TaskExecutor, TaskExecutionContext } from './executor.js'

// ── Configuration ────────────────────────────────────────────────────────

export interface SchedulerOptions {
  /** Maximum number of concurrently running tasks. @default 4 */
  readonly concurrencyLimit?: number

  /**
   * Starvation prevention threshold in milliseconds.
   * Tasks waiting longer than this get their effective priority boosted by 1.
   * @default 30_000 (30 seconds)
   */
  readonly starvationThresholdMs?: number

  /**
   * Interval in milliseconds for the scheduler tick.
   * The scheduler checks for new tasks on each tick.
   * @default 100 (100ms)
   */
  readonly tickIntervalMs?: number
}

// ── Scheduler ────────────────────────────────────────────────────────────

/**
 * Runtime scheduler that dispatches queued tasks to executors.
 *
 * The scheduler runs a periodic tick that:
 * 1. Checks if there are free concurrency slots.
 * 2. Picks the highest-priority queued task (with starvation prevention).
 * 3. Finds an executor for the task.
 * 4. Transitions the task to "running" and executes it.
 * 5. On completion, transitions to "completed" or "failed".
 */
export class TaskScheduler {
  private readonly options: Required<SchedulerOptions>
  private readonly manager: TaskManager
  private readonly events: EventBus
  private readonly logger: Logger
  private tickTimer: ReturnType<typeof setInterval> | undefined
  private activeCount = 0

  constructor(manager: TaskManager, events: EventBus, logger: Logger, options: SchedulerOptions = {}) {
    this.manager = manager
    this.events = events
    this.logger = logger
    this.options = {
      concurrencyLimit: options.concurrencyLimit ?? 4,
      starvationThresholdMs: options.starvationThresholdMs ?? 30_000,
      tickIntervalMs: options.tickIntervalMs ?? 100,
    }
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  /**
   * Start the scheduler (begins dispatching ticks).
   */
  start(): void {
    this.tickTimer = setInterval(() => {
      this.tick()
    }, this.options.tickIntervalMs)
    this.logger.info('TaskScheduler started')
  }

  /**
   * Stop the scheduler (stops dispatching, but running tasks continue).
   */
  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = undefined
    }
    this.logger.info('TaskScheduler stopped')
  }

  // ── Tick ─────────────────────────────────────────────────────────────

  /**
   * Single scheduler tick — attempt to dispatch queued tasks.
   */
  private tick(): void {
    while (this.activeCount < this.options.concurrencyLimit) {
      const next = this.pickNextTask()
      if (!next) break

      this.dispatch(next)
    }
  }

  // ── Task selection ───────────────────────────────────────────────────

  /**
   * Pick the next queued task to execute.
   *
   * Selection order:
   * 1. Highest effective priority (with starvation boost).
   * 2. Within same priority, FIFO (oldest first).
   */
  private pickNextTask(): Task | undefined {
    const queued = this.manager.getByState('queued')
    if (queued.length === 0) return undefined

    const now = Date.now()

    // Sort by effective priority (descending), then by creation time (ascending).
    queued.sort((a, b) => {
      const aPriority = this.getEffectivePriority(a, now)
      const bPriority = this.getEffectivePriority(b, now)

      if (aPriority !== bPriority) {
        return bPriority - aPriority // Higher priority first.
      }

      // FIFO within same priority.
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })

    return queued[0]
  }

  /**
   * Calculate effective priority with starvation prevention.
   *
   * If a task has been waiting longer than the starvation threshold,
   * its effective priority is boosted by one level.
   */
  private getEffectivePriority(task: Task, now: number): number {
    const base = PRIORITY_WEIGHTS[task.priority]
    const waitTime = now - new Date(task.createdAt).getTime()

    if (waitTime >= this.options.starvationThresholdMs) {
      // Boost by one level, but don't exceed critical.
      return Math.min(base + 1, PRIORITY_WEIGHTS['critical'])
    }

    return base
  }

  // ── Dispatch ─────────────────────────────────────────────────────────

  /**
   * Dispatch a task for execution.
   */
  private dispatch(task: Task): void {
    const executor = this.manager.findExecutor(task)
    if (!executor) {
      this.logger.warn(`No executor found for task ${task.id} (module: ${task.moduleId})`)
      return
    }

    // Transition to running.
    const running = this.manager.startTask(task.id)
    if (!running) return

    this.activeCount++

    // Execute asynchronously — don't block the tick.
    this.executeTask(running, executor).catch((error) => {
      this.logger.error(`Unexpected error executing task ${task.id}:`, error)
    })
  }

  /**
   * Execute a task with the given executor.
   */
  private async executeTask(task: Task, executor: TaskExecutor): Promise<void> {
    const ctx = this.createExecutionContext(task)

    try {
      const result = await executor.execute(task, ctx)
      this.handleTaskResult(task, result)
    } catch (error) {
      this.handleTaskError(task, error)
    } finally {
      this.activeCount--
    }
  }

  private createExecutionContext(task: Task): TaskExecutionContext {
    const token = this.manager.getCancellationToken(task.id)
    return {
      task,
      token: token ?? {
        isCancelled: false,
        onCancelled: () => () => {
          /* noop */
        },
        throwIfCancelled: () => {
          /* noop */
        },
      },
      reportProgress: (percent, message) => {
        this.manager.reportProgress(task.id, percent, message)
      },
      events: this.events,
      logger: this.logger,
    }
  }

  private handleTaskResult(task: Task, result: { success: boolean; error?: string }): void {
    if (result.success) {
      this.manager.complete(task.id, result)
    } else {
      this.manager.fail(task.id, {
        code: 'EXECUTION_FAILED',
        message: result.error ?? 'Task execution failed',
        recoverable: true,
      })
    }
  }

  private handleTaskError(task: Task, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    this.manager.fail(task.id, {
      code: 'EXECUTION_ERROR',
      message,
      recoverable: false,
      details: error,
    })
  }

  // ── Query ────────────────────────────────────────────────────────────

  /**
   * Number of currently running tasks.
   */
  get runningCount(): number {
    return this.activeCount
  }

  /**
   * Number of available execution slots.
   */
  get availableSlots(): number {
    return Math.max(0, this.options.concurrencyLimit - this.activeCount)
  }
}
