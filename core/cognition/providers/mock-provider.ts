/**
 * AIRI Core — Mock Cognition Provider
 *
 * Deterministic, fixture-driven plan proposal provider for testing.
 * No real LLM integration — produces pre-registered proposals based on
 * prompt pattern matching.
 *
 * Usage:
 * ```ts
 * const provider = new MockCognitionProvider()
 * provider.registerFixture("scan", scanProposal)
 * provider.setDefaultProposal(defaultProposal)
 * const response = await provider.generatePlanProposal(request)
 * ```
 */

import type { CognitionProvider } from "../provider.js"
import type {
	CognitionRequest,
		CognitionResponse,
		PlanProposal,
		ReasoningTrace,
		ReasoningEntry,
		ModelInfo,
		ReasoningId,
	} from "../types.js"
import type { CancellationToken } from "../../tasks/cancellation.js"

/**
 * Mock cognition provider for testing.
 *
 * Produces deterministic, fixture-driven plan proposals.
 * No real LLM integration.
 */
export class MockCognitionProvider implements CognitionProvider {
	private readonly fixtures = new Map<string, PlanProposal>()
	private defaultProposal: PlanProposal | undefined

	/**
	 * Register a fixture — when the request prompt contains the pattern,
	 * return this proposal.
	 */
	registerFixture(promptPattern: string, proposal: PlanProposal): void {
		this.fixtures.set(promptPattern, proposal)
	}

	/**
	 * Set a default proposal to return when no fixture matches.
	 */
	setDefaultProposal(proposal: PlanProposal): void {
		this.defaultProposal = proposal
	}

	/**
	 * Generate a plan proposal by matching the request prompt against
	 * registered fixtures, or returning the default proposal.
	 */
	generatePlanProposal(
		request: CognitionRequest,
		cancellationToken?: CancellationToken,
	): Promise<CognitionResponse> {
		// Check cancellation before starting.
		if (cancellationToken?.isCancelled) {
			throw new Error("Task cancelled")
		}

		const startTime = Date.now()

		// Find matching fixture or use default.
		let proposal: PlanProposal | undefined
		for (const [pattern, fixture] of this.fixtures) {
			if (request.prompt.includes(pattern)) {
				proposal = fixture
				break
			}
		}

		proposal ??= this.defaultProposal

		if (!proposal) {
			throw new Error(`No matching fixture or default proposal for prompt: "${request.prompt}"`)
		}

		// Build a deterministic reasoning trace.
			const trace = this.buildReasoningTrace(request.id, proposal)

		const durationMs = Date.now() - startTime

		return Promise.resolve({
			requestId: request.id,
			proposal,
			reasoning: trace,
				modelInfo: this.getModelInfo(),
			durationMs,
			completedAt: new Date().toISOString(),
		})
	}

	/**
	 * Get model info for this mock provider.
	 */
		getModelInfo(): ModelInfo {
		return {
			provider: "mock",
			model: "mock-v1",
		}
	}

	/**
	 * Always available.
	 */
	isAvailable(): Promise<boolean> {
		return Promise.resolve(true)
	}

	// ── Private ────────────────────────────────────────────────────────────

	/**
	 * Build a deterministic reasoning trace for a proposal.
	 */
		private buildReasoningTrace(requestId: ReasoningId, proposal: PlanProposal): ReasoningTrace {
		const now = new Date().toISOString()
		const entries: ReasoningEntry[] = [
			{
				timestamp: now,
				type: "analysis",
				content: `Analyzing request: ${proposal.name}`,
				relatedStepIds: proposal.steps.map((s) => s.id),
			},
			{
				timestamp: now,
				type: "decision",
				content: `Proposing ${proposal.steps.length} steps`,
			},
			{
				timestamp: now,
				type: "conclusion",
				content: `Proposal "${proposal.name}" generated with ${proposal.steps.length} steps`,
			},
		]

		return {
			id: requestId,
			proposalId: proposal.id,
			entries,
			summary: `Mock reasoning for proposal: ${proposal.name}`,
				modelInfo: this.getModelInfo(),
			startedAt: now,
			completedAt: now,
		}
	}
}
