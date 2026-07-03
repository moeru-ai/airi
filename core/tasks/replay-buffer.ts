/**
 * AIRI Core — Task Replay Buffer
 *
 * Bounded in-memory event history for task state transitions.
 *
 * Purpose:
 * - Replay recent task state to reconnecting clients.
 * - Provide a snapshot of current task states on connect.
 * - Enable clients to catch up after a brief disconnect.
 *
 * Design decisions:
 * - Bounded buffer (configurable max events, default 500).
 * - Events are stored with timestamps for ordering.
 * - Snapshot provides current state of all tasks at a point in time.
 */

import type { Task, TaskState } from './types.js'

// ── Replay event ─────────────────────────────────────────────────────────

/**
 * A single task state transition event stored in the replay buffer.
 */
export interface ReplayEvent {
  /** ISO-8601 timestamp of the transition. */
  readonly timestamp: string

  /** The task ID. */
  readonly taskId: string

  /** Previous state. */
  readonly previousState: TaskState

  /** New state. */
  readonly newState: TaskState

  /** Task snapshot after the transition. */
  readonly taskSnapshot: Task
}

// ── Replay buffer ────────────────────────────────────────────────────────

/**
 * Configuration for the replay buffer.
 */
export interface ReplayBufferOptions {
  /** Maximum number of events to retain. @default 500 */
  readonly maxEvents?: number
}

/**
 * Bounded in-memory replay buffer for task state transitions.
 *
 * Stores task state transitions with timestamps, enabling:
 * - Replay of recent events to reconnecting clients.
 * - Snapshot of current task states.
 */
export class TaskReplayBuffer {
  private readonly events: ReplayEvent[] = []
  private readonly options: Required<ReplayBufferOptions>

  constructor(options: ReplayBufferOptions = {}) {
    this.options = {
      maxEvents: options.maxEvents ?? 500,
    }
  }

  // ── Record ──────────────────────────────────────────────────────────

  /**
   * Record a task state transition.
   *
   * @param task - The task after the transition.
   * @param previousState - The state before the transition.
   * @param newState - The state after the transition.
   */
  record(task: Task, previousState: TaskState, newState: TaskState): void {
    const event: ReplayEvent = {
      timestamp: new Date().toISOString(),
      taskId: task.id as string,
      previousState,
      newState,
      taskSnapshot: task,
    }

    this.events.push(event)

    // Enforce bound.
    if (this.events.length > this.options.maxEvents) {
      this.events.splice(0, this.events.length - this.options.maxEvents)
    }
  }

  // ── Replay ──────────────────────────────────────────────────────────

  /**
   * Get all events since a given timestamp.
   *
   * @param since - ISO-8601 timestamp. Returns events after this time.
   * @returns Array of replay events.
   */
  getSince(since: string): ReplayEvent[] {
    const sinceTime = new Date(since).getTime()
    return this.events.filter(e => new Date(e.timestamp).getTime() > sinceTime)
  }

  /**
   * Get the most recent N events.
   *
   * @param count - Number of events to return.
   * @returns Array of replay events, most recent first.
   */
  getRecent(count: number): ReplayEvent[] {
    const start = Math.max(0, this.events.length - count)
    return this.events.slice(start)
  }

  /**
   * Get all events for a specific task.
   *
   * @param taskId - The task ID.
   * @returns Array of replay events for the task.
   */
  getForTask(taskId: string): ReplayEvent[] {
    return this.events.filter(e => e.taskId === taskId)
  }

  // ── Snapshot ────────────────────────────────────────────────────────

  /**
   * Build a snapshot of current task states from the replay buffer.
   *
   * Returns the latest known state for each task that has events
   * in the buffer.
   *
   * @returns Map of task ID → latest task snapshot.
   */
  buildSnapshot(): Map<string, Task> {
    const snapshot = new Map<string, Task>()

    for (const event of this.events) {
      snapshot.set(event.taskId, event.taskSnapshot)
    }

    return snapshot
  }

  // ── Query ───────────────────────────────────────────────────────────

  /**
   * Total number of events in the buffer.
   */
  get size(): number {
    return this.events.length
  }

  /**
   * Clear all events.
   */
  clear(): void {
    this.events.length = 0
  }
}
