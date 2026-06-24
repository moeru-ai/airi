/**
 * AIRI Core — Memory Registry
 *
 * Central registry for semantic memory records. Provides storage, retrieval,
 * and deterministic relevance scoring.
 *
 * Design decisions:
 * - InMemory storage for testing and embedded use.
 * - Deterministic scoring: no ML models, pure heuristic.
 * - Access tracking for frequency-based boosting.
 */

import type {
	MemoryId,
	MemoryRecord,
	MemoryQuery,
	MemoryResult,
	MemoryReference,
	MemoryScope,
	MemoryType,
} from "./types.js"
import { createMemoryId } from "./types.js"

// ── Relevance scoring ─────────────────────────────────────────────────────

/**
 * Compute the base text-match score for a record against a query.
 *
 * Returns 1.0 for exact substring match, 0.0-0.5 for partial word match,
 * or 0.5 when no text query is provided.
 */
function computeTextMatchScore(record: MemoryRecord, query: MemoryQuery): number {
	if (!query.text) return 0.5

	const lowerText = query.text.toLowerCase()
	const titleLower = record.title.toLowerCase()
	const contentLower = record.content.toLowerCase()

	if (titleLower.includes(lowerText) || contentLower.includes(lowerText)) {
		return 1.0
	}

	// Partial word match.
	const words = lowerText.split(/\s+/)
	const recordText = `${record.title} ${record.content}`.toLowerCase()
	const matchCount = words.filter((w) => recordText.includes(w)).length
	return matchCount > 0 ? Math.min(0.5, matchCount / words.length) : 0
}

/**
 * Compute the reference overlap score (+0.3 per matching reference).
 */
function computeReferenceScore(
	record: MemoryRecord,
	queryReferences: MemoryReference[],
): number {
	const matchingRefs = queryReferences.filter((qr) =>
		record.references.some(
			(rr) => rr.type === qr.type && rr.id === qr.id,
		),
	)
	return 0.3 * matchingRefs.length
}

/**
 * Compute the recency boost (+0.1 if accessed within last 24h).
 */
function computeRecencyBoost(record: MemoryRecord): number {
	if (!record.lastAccessedAt) return 0

	const lastAccess = new Date(record.lastAccessedAt).getTime()
	const hoursSinceAccess = (Date.now() - lastAccess) / (1000 * 60 * 60)
	return hoursSinceAccess < 24 ? 0.1 : 0
}

/**
 * Compute deterministic relevance score for a memory record against a query.
 *
 * Scoring algorithm:
 * 1. Exact text match in title/content: score 1.0
 * 2. Reference overlap: +0.3 per matching reference
 * 3. Scope match: +0.2
 * 4. Type match: +0.1
 * 5. Importance weighting: multiply by (0.5 + 0.5 * importance)
 * 6. Recency boost: +0.1 if accessed within last 24h
 * 7. Access frequency: +0.05 * min(accessCount, 10)
 *
 * Before:
 * - record: { title: "Fix auth", content: "JWT refresh", importance: 0.8 }
 * - query: { text: "auth" }
 *
 * After:
 * - score: (1.0 + 0.2 + 0.1) * (0.5 + 0.5 * 0.8) = 1.3 * 0.9 = 1.17
 */
function computeRelevanceScore(record: MemoryRecord, query: MemoryQuery): number {
	let score = computeTextMatchScore(record, query)

	// 2. Reference overlap.
	if (query.references && query.references.length > 0) {
		score += computeReferenceScore(record, query.references)
	}

	// 3. Scope match.
	if (query.scopes && query.scopes.length > 0 && query.scopes.includes(record.scope)) {
		score += 0.2
	}

	// 4. Type match.
	if (query.types && query.types.length > 0 && query.types.includes(record.type)) {
		score += 0.1
	}

	// 5. Importance weighting.
	score *= 0.5 + 0.5 * record.importance

	// 6. Recency boost.
	score += computeRecencyBoost(record)

	// 7. Access frequency boost.
	score += 0.05 * Math.min(record.accessCount, 10)

	return Math.min(score, 2.0) // Cap at 2.0.
}

/**
 * Determine the match type for a result.
 */
function determineMatchType(record: MemoryRecord, query: MemoryQuery): MemoryResult['matchType'] {
	if (query.references && query.references.length > 0) {
		const hasRefMatch = query.references.some((qr) =>
			record.references.some(
				(rr) => rr.type === qr.type && rr.id === qr.id,
			),
		)
		if (hasRefMatch) return 'reference'
	}

	if (query.text) {
		const lowerText = query.text.toLowerCase()
		if (
			record.title.toLowerCase().includes(lowerText) ||
			record.content.toLowerCase().includes(lowerText)
		) {
			return 'exact'
		}
	}

	if (query.sinceTimestamp) {
		if (record.createdAt >= query.sinceTimestamp) {
			return 'temporal'
		}
	}

	return 'semantic'
}

// ── MemoryRegistry ────────────────────────────────────────────────────────

/**
 * Central registry for semantic memory records.
 *
 * Provides storage, retrieval, and deterministic relevance scoring.
 * All operations are synchronous and deterministic.
 */
export class MemoryRegistry {
	private readonly records: Map<MemoryId, MemoryRecord> = new Map()

	/**
	 * Store a memory record.
	 *
	 * If a record with the same ID already exists, it is replaced.
	 */
	register(record: MemoryRecord): void {
		this.records.set(record.id, record)
	}

	/**
	 * Alias for register — used by external modules.
	 */
	store(record: MemoryRecord): MemoryRecord {
		this.register(record)
		return record
	}

	/**
	 * Get a memory record by ID.
	 */
	get(id: MemoryId): MemoryRecord | undefined {
		return this.records.get(id)
	}

	/**
	 * Determine whether a record passes the query's scope/type/workspace filters.
	 */
	private passesFilters(record: MemoryRecord, query: MemoryQuery): boolean {
		if (query.scopes && query.scopes.length > 0 && !query.scopes.includes(record.scope)) {
			return false
		}
		if (query.types && query.types.length > 0 && !query.types.includes(record.type)) {
			return false
		}
		if (query.workspaceId && record.workspaceId !== query.workspaceId) {
			return false
		}
		if (query.repositoryId && record.repositoryId !== query.repositoryId) {
			return false
		}
		if (query.sessionId && record.sessionId !== query.sessionId) {
			return false
		}
		if (query.minImportance !== undefined && record.importance < query.minImportance) {
			return false
		}
		if (query.sinceTimestamp && record.createdAt < query.sinceTimestamp) {
			return false
		}
		return true
	}

	/**
	 * Determine whether a record matches the query text.
	 */
	private matchesText(record: MemoryRecord, query: MemoryQuery): boolean {
		if (!query.text) return true

		const lowerText = query.text.toLowerCase()
		return (
			record.title.toLowerCase().includes(lowerText) ||
			record.content.toLowerCase().includes(lowerText)
		)
	}

	/**
	 * Query memory records with deterministic relevance scoring.
	 *
	 * Results are sorted by relevance score (highest first).
	 * Filters are applied before scoring.
	 */
	query(query: MemoryQuery): MemoryResult[] {
		const results: MemoryResult[] = []

		for (const record of this.records.values()) {
			if (!this.passesFilters(record, query)) continue
			if (!this.matchesText(record, query)) continue

			const relevanceScore = computeRelevanceScore(record, query)
			const matchType = determineMatchType(record, query)

			results.push({ record, relevanceScore, matchType })
		}

		// Sort by relevance score descending.
		results.sort((a, b) => b.relevanceScore - a.relevanceScore)

		// Apply maxResults limit.
		if (query.maxResults !== undefined && query.maxResults > 0) {
			return results.slice(0, query.maxResults)
		}

		return results
	}

	/**
	 * Update a memory record.
	 *
	 * Returns the updated record, or undefined if the record was not found.
	 */
	update(id: MemoryId, updates: Partial<MemoryRecord>): MemoryRecord | undefined {
		const existing = this.records.get(id)
		if (!existing) return undefined

		const now = new Date().toISOString()
		const updated: MemoryRecord = {
			...existing,
			...updates,
			id, // Preserve original ID.
			updatedAt: now,
		}

		this.records.set(id, updated)
		return updated
	}

	/**
	 * Remove a memory record by ID.
	 *
	 * Returns true if the record was removed, false if it did not exist.
	 */
	remove(id: MemoryId): boolean {
		return this.records.delete(id)
	}

	/**
	 * List all memory records, optionally filtered.
	 */
	list(filter?: { scopes?: MemoryScope[]; types?: MemoryType[] }): MemoryRecord[] {
		const records = Array.from(this.records.values())

		if (!filter) return records

		return records.filter((r) => {
			const scopes = filter.scopes
			if (scopes && scopes.length > 0 && !scopes.includes(r.scope)) {
				return false
			}
			const types = filter.types
			if (types && types.length > 0 && !types.includes(r.type)) {
				return false
			}
			return true
		})
	}

	/**
	 * Get the total number of memory records.
	 */
	count(): number {
		return this.records.size
	}

	/**
	 * Remove all memory records.
	 */
	clear(): void {
		this.records.clear()
	}

	/**
	 * Increment the access count and update lastAccessedAt for a record.
	 */
	incrementAccess(id: MemoryId): void {
		const record = this.records.get(id)
		if (!record) return

		const updated: MemoryRecord = {
			...record,
			accessCount: record.accessCount + 1,
			lastAccessedAt: new Date().toISOString(),
		}

		this.records.set(id, updated)
	}

	/**
	 * Find records that reference a specific artifact.
	 */
	getByReference(ref: MemoryReference): MemoryRecord[] {
		return Array.from(this.records.values()).filter((r) =>
			r.references.some(
				(rr) => rr.type === ref.type && rr.id === ref.id,
			),
		)
	}

	/**
	 * Get all memories for a specific scope target.
	 */
	getByScope(scope: MemoryScope, id: string): MemoryRecord[] {
		return Array.from(this.records.values()).filter((r) => {
			if (r.scope !== scope) return false

			switch (scope) {
				case 'session':
					return r.sessionId === id
				case 'workspace':
					return r.workspaceId === id
				case 'repository':
					return r.repositoryId === id
				default:
					return true
			}
		})
	}

	// ── Test helpers ─────────────────────────────────────────────────────

	/**
	 * Generate a unique memory ID with an optional prefix.
	 */
	static generateId(prefix = 'mem'): MemoryId {
		return createMemoryId(`${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
	}
}
