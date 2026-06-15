/**
 * AIRI Core — Memory Retriever
 *
 * Assembles retrieval context for cognition, combining memory results,
 * repository intelligence, and decision/failure history.
 *
 * Design decisions:
 * - Context assembly is deterministic: same input produces same output.
 * - Repository context is optional (only when a map is available).
 * - Decision/failure context is optional (only when memory is available).
 * - All retrieval operations are traced for auditing.
 */

import type {
	MemoryQuery,
	MemoryResult,
	RetrievalContext,
	RetrievalTrace,
	DecisionRecord,
	FailurePattern,
	RepositoryMap,
	FileGraphNode,
	ArchitectureNode,
} from "./types.js"
import type { MemoryRegistry } from "./registry.js"
import type { RepositoryIntelligence } from "./repository-map.js"
import type { DecisionMemory } from "./decision-memory.js"
import type { FailureMemory } from "./failure-memory.js"
import { createRetrievalId } from "./types.js"

// ── Context assembly ──────────────────────────────────────────────────────

/**
 * Options for context string assembly.
 */
interface ContextAssemblyOptions {
	/** Repository map for repository context. */
	repositoryMap?: RepositoryMap

	/** Relevant files for repository context. */
	relevantFiles?: FileGraphNode[]

	/** Relevant architecture nodes. */
	architectureNodes?: ArchitectureNode[]

	/** Recent decisions for decision history. */
	recentDecisions?: DecisionRecord[]

	/** Known failure patterns. */
	failurePatterns?: FailurePattern[]

	/** Maximum length of the context string. */
	maxLength?: number
}

/**
 * Assemble a deterministic context string from memory results.
 *
 * Format:
 * ```
 * ## Semantic Memory Context
 *
 * ### Relevant Memories
 * [1] (decision, 0.95) Fix authentication middleware — accepted proposal for JWT refresh
 * [2] (failure, 0.87) Workspace corruption on concurrent access — pattern: workspace_race_condition
 *
 * ### Repository Context
 * - Branch: main (abc123)
 * - Relevant files: src/auth/middleware.ts, src/auth/jwt.ts
 *
 * ### Decision History
 * - Last 3 decisions: 2 accepted, 1 rejected (capability mismatch)
 * - Known failure patterns: workspace_race_condition (3 occurrences)
 * ```
 */
function buildContextString(
	results: MemoryResult[],
	options: ContextAssemblyOptions = {},
): string {
	const parts: string[] = []

	parts.push("## Semantic Memory Context")

	// Relevant memories.
	if (results.length > 0) {
		parts.push("")
		parts.push("### Relevant Memories")
		for (let i = 0; i < results.length; i++) {
			const result = results[i]!
			const record = result.record
			parts.push(
				`[${i + 1}] (${record.type}, ${result.relevanceScore.toFixed(2)}) ${record.title} — ${record.content.slice(0, 100)}`,
			)
		}
	}

	// Repository context.
	if (options.repositoryMap) {
		const map = options.repositoryMap
		parts.push("")
		parts.push("### Repository Context")
		parts.push(`- Branch: ${map.gitMetadata.branch} (${map.gitMetadata.commit.slice(0, 7)})`)

		if (options.relevantFiles && options.relevantFiles.length > 0) {
			parts.push(
				`- Relevant files: ${options.relevantFiles.map((f) => f.path).join(", ")}`,
			)
		}

		if (options.architectureNodes && options.architectureNodes.length > 0) {
			parts.push(
				`- Architecture: ${options.architectureNodes.map((n) => `${n.name} (${n.type})`).join(", ")}`,
			)
		}
	}

	// Decision history.
	if (options.recentDecisions && options.recentDecisions.length > 0) {
		const accepted = options.recentDecisions.filter((d) => d.type === 'accepted').length
		const rejected = options.recentDecisions.filter((d) => d.type === 'rejected').length
		const revised = options.recentDecisions.filter((d) => d.type === 'revised').length

		parts.push("")
		parts.push("### Decision History")
		parts.push(
			`- Last ${options.recentDecisions.length} decisions: ${accepted} accepted, ${rejected} rejected, ${revised} revised`,
		)
	}

	// Failure patterns.
	if (options.failurePatterns && options.failurePatterns.length > 0) {
		parts.push("")
		parts.push("### Known Failure Patterns")
		for (const pattern of options.failurePatterns) {
			parts.push(
				`- ${pattern.type} (${pattern.occurrences} occurrences): ${pattern.suggestedAction ?? "No suggestion"}`,
			)
		}
	}

	const contextString = parts.join("\n")

	if (options.maxLength && contextString.length > options.maxLength) {
		return contextString.slice(0, options.maxLength) + "\n... (truncated)"
	}

	return contextString
}

// ── MemoryRetriever ───────────────────────────────────────────────────────

/**
 * Assembles retrieval context for cognition.
 *
 * Combines memory query results with repository intelligence and
 * decision/failure history into a single deterministic context.
 */
export class MemoryRetriever {
	private readonly registry: MemoryRegistry
	private readonly repositoryIntelligence?: RepositoryIntelligence
	private readonly decisionMemory?: DecisionMemory
	private readonly failureMemory?: FailureMemory

	constructor(
		registry: MemoryRegistry,
		options: {
			repositoryIntelligence?: RepositoryIntelligence
			decisionMemory?: DecisionMemory
			failureMemory?: FailureMemory
		} = {},
	) {
		this.registry = registry
		this.repositoryIntelligence = options.repositoryIntelligence
		this.decisionMemory = options.decisionMemory
		this.failureMemory = options.failureMemory
	}

	/**
	 * Retrieve context for cognition.
	 *
	 * Assembles a full RetrievalContext with memory results, repository
	 * context, decision history, and failure patterns.
	 */
	async retrieveForContext(query: MemoryQuery): Promise<RetrievalContext> {

		// Query memory registry.
		const results = this.registry.query(query)

		// Increment access counts for retrieved records.
		for (const result of results) {
			this.registry.incrementAccess(result.record.id)
		}

		// Build repository context if available.
		let repositoryContext: RetrievalContext['repositoryContext']
		if (this.repositoryIntelligence && query.repositoryId) {
			const maps = this.repositoryIntelligence.listMaps()
			const map = maps.find((m) =>
				m.fileGraph.some((f) => f.path.includes(query.repositoryId ?? "")),
			) ?? maps[0]

			if (map) {
				const relevantFiles = query.text
					? map.fileGraph.filter((f) =>
							f.path.toLowerCase().includes((query.text ?? "").toLowerCase()),
						)
					: []

				const architectureNodes = relevantFiles.length > 0
					? map.rootNodes.filter((n) =>
							relevantFiles.some((f) => f.path.startsWith(n.path)),
						)
					: []

				repositoryContext = {
					map,
					relevantFiles,
					architectureNodes,
				}
			}
		}

		// Build decision context if available.
		let decisionContext: RetrievalContext['decisionContext']
		if (this.decisionMemory || this.failureMemory) {
			decisionContext = {
				recentDecisions: this.decisionMemory
					? this.decisionMemory.getDecisions()
					: [],
				failurePatterns: this.failureMemory
					? this.failureMemory.detectPatterns()
					: [],
			}
		}

		// Build context string.
		const contextOptions: ContextAssemblyOptions = {}
		if (repositoryContext) {
			contextOptions.repositoryMap = repositoryContext.map
			contextOptions.relevantFiles = repositoryContext.relevantFiles
			contextOptions.architectureNodes = repositoryContext.architectureNodes
		}
		if (decisionContext) {
			contextOptions.recentDecisions = decisionContext.recentDecisions
			contextOptions.failurePatterns = decisionContext.failurePatterns
		}
		const contextString = buildContextString(results, contextOptions)

		

		// Create trace.
		const trace = this.traceRetrieval(query, results, contextString)

		return {
			results,
			contextString,
			repositoryContext,
			decisionContext,
			trace,
		}
	}

	/**
	 * Retrieve workspace-scoped memories.
	 */
	async retrieveForWorkspace(
		workspaceId: string,
		maxResults = 10,
	): Promise<MemoryResult[]> {
		return this.registry.query({
			workspaceId,
			scopes: ['workspace', 'global'],
			maxResults,
		})
	}

	/**
	 * Retrieve repository-scoped memories.
	 */
	async retrieveForRepository(
		repositoryId: string,
		maxResults = 10,
	): Promise<MemoryResult[]> {
		return this.registry.query({
			repositoryId,
			scopes: ['repository', 'global'],
			maxResults,
		})
	}

	/**
	 * Build a deterministic context string from results.
	 */
	buildContextString(
		results: MemoryResult[],
		maxLength?: number,
	): string {
		return buildContextString(results, { maxLength })
	}

	/**
	 * Create an audit trace for a retrieval operation.
	 */
	traceRetrieval(
		query: MemoryQuery,
		results: MemoryResult[],
		contextUsed: string,
		requestId?: string,
	): RetrievalTrace {
		return {
			id: createRetrievalId(`retrieval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
			query,
			results,
			contextUsed,
			requestId,
			timestamp: new Date().toISOString(),
			durationMs: 0, // Set by caller if needed.
		}
	}
}
