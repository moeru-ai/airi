/**
 * AIRI Core — Failure Memory
 *
 * Records and analyzes execution failures. Detects recurring patterns
 * to enable proactive recovery suggestions.
 *
 * Design decisions:
 * - Failures are immutable after recording.
 * - Pattern detection is deterministic: groups by error signature.
 * - Suggested actions are derived from pattern type, not AI reasoning.
 */

import type { FailureRecord, FailurePattern, MemoryId } from "./types.js"
import { createMemoryId } from "./types.js"

// ── Pattern detection ─────────────────────────────────────────────────────

/**
 * Extract a normalized error signature from an error message.
 *
 * Strips variable parts (timestamps, IDs, paths) to create a stable
 * signature for grouping.
 *
 * Before:
 * - "Error: timeout after 5000ms connecting to host-abc123"
 *
 * After:
 * - "error: timeout after <N>ms connecting to host-<ID>"
 */
function normalizeErrorSignature(error: string): string {
	let sig = error.toLowerCase().trim()

	// Replace numbers with <N>.
	sig = sig.replace(/\d+/g, '<N>')

	// Replace quoted strings with <STR>.
	sig = sig.replace(/'[^']*'/g, "<STR>")
	sig = sig.replace(/"[^"]*"/g, '<STR>')

	// Replace hex hashes with <HASH>.
	sig = sig.replace(/[0-9a-f]{8,}/gi, '<HASH>')

	// Replace file paths with <PATH>.
	sig = sig.replace(/\/[\w./-]+/g, '<PATH>')

	// Replace UUIDs with <UUID>.
	sig = sig.replace(
		/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
		'<UUID>',
	)

	return sig
}

/**
 * Determine the pattern type from an error signature.
 */
function determinePatternType(signature: string): string {
	if (signature.includes('timeout') || signature.includes('timed out')) {
		return 'timeout'
	}
	if (signature.includes('permission') || signature.includes('eacces')) {
		return 'permission'
	}
	if (signature.includes('enoent') || signature.includes('not found') || signature.includes('no such file')) {
		return 'file_not_found'
	}
	if (signature.includes('econnrefused') || signature.includes('econnreset') || signature.includes('network')) {
		return 'network'
	}
	if (signature.includes('memory') || signature.includes('allocation')) {
		return 'resource_exhaustion'
	}
	if (signature.includes('race') || signature.includes('concurrent') || signature.includes('lock')) {
		return 'workspace_race_condition'
	}
	if (signature.includes('validation') || signature.includes('invalid') || signature.includes('schema')) {
		return 'validation'
	}
	if (signature.includes('workspace') || signature.includes('corrupt')) {
		return 'workspace_corruption'
	}
	return 'unknown'
}

/**
 * Get a suggested action for a pattern type.
 */
function getSuggestedActionForType(type: string): string | undefined {
	switch (type) {
		case 'timeout':
			return 'Increase timeout or implement retry with exponential backoff'
		case 'permission':
			return 'Check file permissions and ensure the process has required access'
		case 'file_not_found':
			return 'Verify file paths exist before access; add pre-flight checks'
		case 'network':
			return 'Check network connectivity; implement retry with backoff'
		case 'resource_exhaustion':
			return 'Reduce concurrency; implement resource pooling or streaming'
		case 'workspace_race_condition':
			return 'Implement file locking or serialize workspace operations'
		case 'validation':
			return 'Review input schemas; add pre-validation before processing'
		case 'workspace_corruption':
			return 'Implement workspace integrity checks; add recovery procedures'
		default:
			return undefined
	}
}

// ── FailureMemory ─────────────────────────────────────────────────────────

/**
 * Records execution failures and detects recurring patterns.
 */
export class FailureMemory {
	private readonly failures: Map<MemoryId, FailureRecord> = new Map()
	private readonly patterns: Map<string, FailurePattern> = new Map()

	/**
	 * Record a failure.
	 */
	recordFailure(failure: FailureRecord): void {
		this.failures.set(failure.id, failure)
	}

	/**
	 * Get failures, optionally filtered.
	 */
	getFailures(filter?: {
		type?: string
		taskId?: string
	}): FailureRecord[] {
		const failures = Array.from(this.failures.values())

		if (!filter) return failures

		return failures.filter((f) => {
			if (filter.type && f.type !== filter.type) return false
			if (filter.taskId && f.taskId !== filter.taskId) return false
			return true
		})
	}

	/**
	 * Detect recurring failure patterns.
	 *
	 * Groups failures by normalized error signature. If 3+ failures
	 * share the same signature, a pattern is created.
	 */
	detectPatterns(): FailurePattern[] {
		const signatureGroups = new Map<string, FailureRecord[]>()

		// Group failures by normalized signature.
		for (const failure of this.failures.values()) {
			const signature = normalizeErrorSignature(failure.error)

			if (!signatureGroups.has(signature)) {
				signatureGroups.set(signature, [])
			}
			signatureGroups.get(signature)!.push(failure)
		}

		// Create patterns for groups with 3+ occurrences.
		const patterns: FailurePattern[] = []

		for (const [signature, group] of signatureGroups) {
			if (group.length < 3) continue

			const type = determinePatternType(signature)
			const sortedByTime = [...group].sort(
				(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
			)

			const pattern: FailurePattern = {
				id: `pattern-${type}-${signature.slice(0, 30)}`,
				pattern: signature,
				type,
				occurrences: group.length,
				firstSeen: sortedByTime[0]!.timestamp,
				lastSeen: sortedByTime[sortedByTime.length - 1]!.timestamp,
				memoryIds: group.map((f) => f.id),
				suggestedAction: getSuggestedActionForType(type),
			}

			patterns.push(pattern)
			this.patterns.set(pattern.id, pattern)
		}

		return patterns
	}

	/**
	 * Get a specific pattern by ID.
	 */
	getPattern(patternId: string): FailurePattern | undefined {
		return this.patterns.get(patternId)
	}

	/**
	 * Get the suggested action for a pattern.
	 */
	getSuggestedAction(patternId: string): string | undefined {
		const pattern = this.patterns.get(patternId)
		return pattern?.suggestedAction
	}

	/**
	 * Get failure statistics.
	 */
	getFailureStats(): {
		total: number
		byType: Record<string, number>
		withRecovery: number
	} {
		const failures = Array.from(this.failures.values())
		const byType: Record<string, number> = {}

		for (const failure of failures) {
			byType[failure.type] = (byType[failure.type] ?? 0) + 1
		}

		return {
			total: failures.length,
			byType,
			withRecovery: failures.filter((f) => f.recoveryAttempted).length,
		}
	}

	/**
	 * Get all failures as an array.
	 */
	list(): FailureRecord[] {
		return Array.from(this.failures.values())
	}

	/**
	 * Get the total number of failures.
	 */
	count(): number {
		return this.failures.size
	}

	/**
	 * Remove all failures and patterns.
	 */
	clear(): void {
		this.failures.clear()
		this.patterns.clear()
	}

	// ── Test helpers ─────────────────────────────────────────────────────

	/**
	 * Generate a unique failure ID.
	 */
	generateId(prefix = 'failure'): MemoryId {
		return createMemoryId(`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
	}
}
