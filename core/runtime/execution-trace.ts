/**
 * AIRI Core — Execution Trace
 *
 * Append-only execution record store for tool invocations. Provides
 * filtering, redaction, and recent-record queries.
 *
 * Design decisions:
 * - Append-only: records are never modified or deleted (except via clear).
 * - Redaction is a placeholder — returns input as-is today, future
 *   versions will strip tokens, keys, and PII.
 * - Filtering supports toolId, taskId, and since timestamp.
 * - Optional EventStore persistence: records are persisted to the event
 *   store in addition to in-memory storage.
 */

import type { ToolId } from "../capabilities/types.js"
import type { TaskId } from "../tasks/types.js"
import type { EventStore } from "../persistence/types.js"
import type { AiriEvent } from "../events/types.js"

// ── Redaction ──────────────────────────────────────────────────────────

/**
 * Redact sensitive data from tool input/output.
 *
 * Currently a no-op — returns input as-is. Future versions will strip
 * tokens, API keys, and PII.
 *
 * @param input - The value to redact.
 * @returns The redacted value (currently unchanged).
 */
export function redactSensitive(input: unknown): unknown {
	// TODO: Implement redaction logic (strip tokens, keys, PII).
	return input
}

// ── Trace entry ────────────────────────────────────────────────────────

/**
 * A single execution trace entry.
 *
 * Records the full lifecycle of a tool execution attempt.
 */
export interface ExecutionTraceEntry {
	/** Unique identifier for this execution record. */
	readonly executionId: string

	/** The tool that was executed. */
	readonly toolId: ToolId

	/** The task this execution is associated with. */
	readonly taskId: TaskId

	/** Unix timestamp (ms) when execution started. */
	readonly startedAt: number

	/** Unix timestamp (ms) when execution completed, if completed. */
	readonly completedAt?: number

	/** Execution duration in milliseconds, if completed. */
	readonly durationMs?: number

	/** Whether the execution succeeded. */
	readonly success: boolean

	/** Tool input (redacted). */
	readonly input: unknown

	/** Tool output (redacted), if successful. */
	readonly output?: unknown

	/** Error details, if failed. */
	readonly error?: {
		readonly code: string
		readonly message: string
	}

	/** Additional metadata. */
	readonly metadata: Record<string, unknown>
}

// ── Filter options ─────────────────────────────────────────────────────

/**
 * Filter options for querying execution trace records.
 */
export interface ExecutionTraceFilter {
	/** Filter by tool ID. */
	readonly toolId?: ToolId

	/** Filter by task ID. */
	readonly taskId?: TaskId

	/** Filter by start time — only return records at or after this timestamp. */
	readonly since?: number
}

// ── Execution Trace ────────────────────────────────────────────────────

/**
 * Append-only execution trace store.
 *
 * Records tool execution attempts for debugging, auditing, and replay.
 * When an EventStore is configured, records are also persisted durably.
 */
export class ExecutionTrace {
	private readonly records: ExecutionTraceEntry[] = []

	/**
	 * Optional event store for persisting execution records.
	 * When configured, each record() call also persists to the event store.
	 */
	private readonly eventStore: EventStore | undefined

	/**
	 * Create a new ExecutionTrace.
	 *
	 * @param eventStore - Optional event store for durable persistence.
	 */
	constructor(eventStore?: EventStore) {
		this.eventStore = eventStore
	}

	/**
	 * Record a new execution trace entry.
	 *
	 * Input and output are redacted before storage.
	 * If an EventStore is configured, the record is also persisted.
	 *
	 * @param entry - The execution trace entry to record.
	 */
	record(entry: ExecutionTraceEntry): void {
		const redacted: ExecutionTraceEntry = {
			...entry,
			input: redactSensitive(entry.input),
			output: entry.output !== undefined ? redactSensitive(entry.output) : undefined,
		}
		this.records.push(redacted)

		// Persist to event store if configured.
		if (this.eventStore) {
			this.eventStore.append({
				type: "tool.execution.recorded",
				timestamp: new Date().toISOString(),
				source: "execution-trace",
				executionId: entry.executionId,
				toolId: entry.toolId as string,
				taskId: entry.taskId as string,
				success: entry.success,
				durationMs: entry.durationMs,
			} as AiriEvent).catch(() => {
				// Persistence failure should not block in-memory recording.
			})
		}
	}

	/**
	 * Get execution trace records, optionally filtered.
	 *
	 * @param filter - Optional filter criteria.
	 * @returns Array of matching execution trace entries.
	 */
	getRecords(filter?: ExecutionTraceFilter): ExecutionTraceEntry[] {
		if (!filter) return [...this.records]
		return this.records.filter((entry) => this.matchesFilter(entry, filter))
	}

	private matchesFilter(entry: ExecutionTraceEntry, filter: ExecutionTraceFilter): boolean {
		if (filter.toolId !== undefined && entry.toolId !== filter.toolId) return false
		if (filter.taskId !== undefined && entry.taskId !== filter.taskId) return false
		if (filter.since !== undefined && entry.startedAt < filter.since) return false
		return true
	}

	/**
	 * Get the most recent N execution trace entries.
	 *
	 * @param count - Maximum number of entries to return.
	 * @returns Array of the most recent execution trace entries.
	 */
	getRecent(count: number): ExecutionTraceEntry[] {
		if (count <= 0) return []
		const start = Math.max(0, this.records.length - count)
		return this.records.slice(start)
	}

	/**
	 * Remove all execution trace records.
	 */
	clear(): void {
		this.records.length = 0
	}

	/**
	 * Get the number of recorded execution trace entries.
	 */
	size(): number {
		return this.records.length
	}

	/**
	 * Flush all pending records to the event store.
	 *
	 * Since records are persisted immediately in the record() method,
	 * this method is a no-op for now. It exists as a hook for future
	 * batching optimizations.
	 *
	 * async: reserved for future batching — currently a no-op but callers
	 * await it so the signature must stay Promise<void>.
	 */
	async flush(): Promise<void> {
		// All records are persisted immediately. No-op.
	}
}
