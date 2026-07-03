/**
 * AIRI Core — Worker Metrics
 *
 * Tracks operational metrics for the worker pool.
 * Provides a snapshot() method for health monitoring and diagnostics.
 */

// ── Metrics snapshot ────────────────────────────────────────────────────

/**
 * Point-in-time snapshot of worker pool metrics.
 */
export interface WorkerMetricsSnapshot {
  /** Total number of workers ever started. */
  readonly totalWorkers: number

  /** Number of currently active (non-dead) workers. */
  readonly activeWorkers: number

  /** Number of idle workers ready for tasks. */
  readonly idleWorkers: number

  /** Number of workers currently executing tasks. */
  readonly busyWorkers: number

  /** Total number of tasks completed successfully. */
  readonly tasksCompleted: number

  /** Total number of tasks that failed. */
  readonly tasksFailed: number

  /** Total number of worker crashes detected. */
  readonly workerCrashes: number

  /** Average worker uptime in milliseconds. */
  readonly averageWorkerUptimeMs: number

  /** Timestamp when metrics collection started. */
  readonly startedAt: string
}

// ── Metrics collector ───────────────────────────────────────────────────

/**
 * Collects and exposes worker pool metrics.
 */
export class WorkerMetrics {
  private totalWorkers = 0
  private activeWorkers = 0
  private idleWorkers = 0
  private busyWorkers = 0
  private tasksCompleted = 0
  private tasksFailed = 0
  private workerCrashes = 0
  private totalUptimeMs = 0
  private readonly startedAt = new Date().toISOString()

  // ── Recording ────────────────────────────────────────────────────────

  /** Record that a worker was started. */
  recordWorkerStarted(): void {
    this.totalWorkers++
    this.activeWorkers++
  }

  /** Record that a worker was stopped/died. */
  recordWorkerStopped(): void {
    this.activeWorkers = Math.max(0, this.activeWorkers - 1)
  }

  /** Record a worker crash. */
  recordWorkerCrash(): void {
    this.workerCrashes++
  }

  /** Record a task completion. */
  recordTaskCompleted(): void {
    this.tasksCompleted++
  }

  /** Record a task failure. */
  recordTaskFailed(): void {
    this.tasksFailed++
  }

  // ── Snapshot ─────────────────────────────────────────────────────────

  /**
   * Return a point-in-time snapshot of all metrics.
   */
  snapshot(): WorkerMetricsSnapshot {
    return {
      totalWorkers: this.totalWorkers,
      activeWorkers: this.activeWorkers,
      idleWorkers: this.idleWorkers,
      busyWorkers: this.busyWorkers,
      tasksCompleted: this.tasksCompleted,
      tasksFailed: this.tasksFailed,
      workerCrashes: this.workerCrashes,
      averageWorkerUptimeMs: this.totalWorkers > 0
        ? Math.round(this.totalUptimeMs / this.totalWorkers)
        : 0,
      startedAt: this.startedAt,
    }
  }
}
