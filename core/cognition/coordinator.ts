/**
 * AIRI Core — Cognition Coordinator
 *
 * Coordinates the cognition pipeline:
 *   request → memory retrieval → provider → proposal → validation → planner
 *
 * The coordinator ensures:
 * - Planner remains execution authority.
 * - Plans become immutable after validation.
 * - Rejected proposals are preserved for auditing.
 * - All steps are replayable via event emission.
 * - Semantic memory is retrieved before provider calls (if configured).
 */

import type { CognitionProvider } from "./provider.js"
import type { PlanValidator } from "./validator.js"
import type {
	CognitionRequest,
	CognitionResponse,
	CognitionContext,
	PlanProposal,
	ValidationResult,
} from "./types.js"
import type { Plan } from "../planner/types.js"
import type { EventBus } from "../events/bus.js"
import type { Logger } from "../logger.js"
import type { EventStore } from "../persistence/types.js"
import type { CognitionConstraints } from "./types.js"
import type { MemoryRetriever } from "../memory/retrieval.js"
import { DecisionMemory } from "../memory/decision-memory.js"
import { createReasoningId } from "./types.js"
import { proposalToPlan } from "./proposals.js"

// ── Pipeline result ──────────────────────────────────────────────────────

/**
 * Result of the full cognition pipeline.
 *
 * Contains every stage of the pipeline for auditing and replay.
 */
export interface CognitionPipelineResult {
	/** The cognition request that initiated the pipeline. */
	readonly request: CognitionRequest

	/** The cognition response from the provider. */
	readonly response: CognitionResponse

	/** The generated proposal. */
	readonly proposal: PlanProposal

	/** The validation result. */
	readonly validationResult: ValidationResult

	/** The plan (only present if validation passed). */
	readonly plan?: Plan

	/** Whether the proposal was accepted (validated and converted). */
	readonly accepted: boolean
}

// ── Coordinator ───────────────────────────────────────────────────────────

/**
 * Coordinates the cognition pipeline:
 * request → memory retrieval → provider → proposal → validation → planner
 *
 * The coordinator ensures:
 * - Planner remains execution authority
 * - Plans become immutable after validation
 * - Rejected proposals are preserved for auditing
 * - All steps are replayable
 * - Semantic memory is retrieved before provider calls (if configured)
 */
export class CognitionCoordinator {
	private readonly provider: CognitionProvider
	private readonly validator: PlanValidator
	private readonly events: EventBus
	private readonly logger: Logger
	private readonly eventStore?: EventStore
	private readonly memoryRetriever?: MemoryRetriever
	private readonly decisionMemory?: DecisionMemory

	constructor(
		provider: CognitionProvider,
		validator: PlanValidator,
		events: EventBus,
		logger: Logger,
		options: {
			eventStore?: EventStore
			memoryRetriever?: MemoryRetriever
			decisionMemory?: DecisionMemory
		} = {},
	) {
		this.provider = provider
		this.validator = validator
		this.events = events
		this.logger = logger
		this.eventStore = options.eventStore
		this.memoryRetriever = options.memoryRetriever
		this.decisionMemory = options.decisionMemory
	}

	/**
	 * Generate a plan proposal from context.
	 *
	 * Flow:
	 * 1. Retrieve semantic memory (if retriever configured)
	 * 2. Create cognition request
	 * 3. Call provider.generatePlanProposal
	 * 4. Emit cognition events
	 * 5. Validate proposal
	 * 6. Emit validation events
	 * 7. If valid, convert to Plan
	 * 8. Record decision (if decision memory configured)
	 * 9. Persist if event store configured
	 */
  // async: returns Promise for async plan proposal
	async proposePlan(
		context: CognitionContext,
		prompt: string,
		options: {
			constraints?: CognitionConstraints
			sessionId?: string
		} = {},
	): Promise<CognitionPipelineResult> {
		const requestId = createReasoningId(`reasoning-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
		const now = new Date().toISOString()

		const enrichedContext = await this.enrichContextWithMemory(context, prompt, requestId, now)
		const request = this.buildCognitionRequest(requestId, enrichedContext, prompt, options, now)

		this.emitCognitionRequested(requestId, options, context, now)
		this.logger.info(`[CognitionCoordinator] Generating proposal for: "${prompt}"`)
		const response = await this.provider.generatePlanProposal(request)

		const completedAt = new Date().toISOString()
		this.emitCognitionCompleted(requestId, response, completedAt)
		this.emitPlanProposed(requestId, response, completedAt)

		const validationResult = this.validator.validate(response.proposal)

		if (validationResult.valid) {
			return this.handleAcceptedProposal(request, response, validationResult, options)
		}
		return this.handleRejectedProposal(request, response, validationResult)
	}

	// ── Private: memory enrichment ───────────────────────────────────────

	private async enrichContextWithMemory(
		context: CognitionContext,
		prompt: string,
		requestId: ReturnType<typeof createReasoningId>,
		now: string,
	): Promise<CognitionContext> {
		if (!this.memoryRetriever) return context

		try {
			const retrievalContext = await this.memoryRetriever.retrieveForContext({
				text: prompt,
				scopes: ['global', 'workspace', 'repository'],
				workspaceId: context.workspaceId,
				repositoryId: context.repositoryId,
				maxResults: 10,
			})

			if (retrievalContext.results.length === 0) return context

			this.events.emit("memory.retrieved", {
				timestamp: now,
				source: "cognition-coordinator",
				resultCount: retrievalContext.results.length,
				queryText: prompt,
				requestId: requestId as string,
			})
			this.logger.info(`[CognitionCoordinator] Retrieved ${retrievalContext.results.length} memories for context`)

			return {
				...context,
				memoryContext: {
					retrievedMemories: retrievalContext.results.map((r) => r.record.id),
					contextString: retrievalContext.contextString,
				},
				repositoryContext: retrievalContext.repositoryContext
					? {
							mapId: retrievalContext.repositoryContext.map.id,
							relevantFiles: retrievalContext.repositoryContext.relevantFiles.map((f) => f.path),
						}
					: context.repositoryContext,
			}
		} catch (error) {
			this.logger.warn(
				`[CognitionCoordinator] Memory retrieval failed: ${error instanceof Error ? error.message : String(error)}`,
			)
			return context
		}
	}

	private buildCognitionRequest(
		requestId: ReturnType<typeof createReasoningId>,
		enrichedContext: CognitionContext,
		prompt: string,
		options: { constraints?: CognitionConstraints; sessionId?: string },
		now: string,
	): CognitionRequest {
		return {
			id: requestId,
			context: enrichedContext,
			prompt,
			constraints: options.constraints,
			metadata: { sessionId: options.sessionId },
			createdAt: now,
		}
	}

	// ── Private: event emission ──────────────────────────────────────────

	private emitCognitionRequested(
		requestId: ReturnType<typeof createReasoningId>,
		options: { sessionId?: string },
		context: CognitionContext,
		now: string,
	): void {
		this.events.emit("cognition.requested", {
			timestamp: now,
			source: "cognition-coordinator",
			requestId: requestId as string,
			sessionId: options.sessionId,
			workspaceId: context.workspaceId,
		})
	}

	private emitCognitionCompleted(
		requestId: ReturnType<typeof createReasoningId>,
		response: CognitionResponse,
		completedAt: string,
	): void {
		this.events.emit("cognition.completed", {
			timestamp: completedAt,
			source: "cognition-coordinator",
			requestId: requestId as string,
			proposalId: response.proposal.id as string,
			modelInfo: response.modelInfo,
			durationMs: response.durationMs,
		})
	}

	private emitPlanProposed(
		requestId: ReturnType<typeof createReasoningId>,
		response: CognitionResponse,
		completedAt: string,
	): void {
		this.events.emit("plan.proposed", {
			timestamp: completedAt,
			source: "cognition-coordinator",
			proposalId: response.proposal.id as string,
			requestId: requestId as string,
			name: response.proposal.name,
			stepCount: response.proposal.steps.length,
			confidence: response.proposal.confidence,
		})
	}

	// ── Private: accepted / rejected handling ────────────────────────────

	private handleAcceptedProposal(
		request: CognitionRequest,
		response: CognitionResponse,
		validationResult: ValidationResult,
		options: { sessionId?: string },
	): CognitionPipelineResult {
		const plan = CognitionCoordinator.acceptProposal(response.proposal, { sessionId: options.sessionId })

		this.events.emit("plan.validated", {
			timestamp: new Date().toISOString(),
			source: "cognition-coordinator",
			proposalId: response.proposal.id as string,
			planId: plan.id as string,
			validationResult,
		})

		this.recordDecision(response.proposal, plan, validationResult)

		this.logger.info(`[CognitionCoordinator] Proposal "${response.proposal.name}" accepted (${response.proposal.steps.length} steps)`)

		return {
			request,
			response,
			proposal: response.proposal,
			validationResult,
			plan,
			accepted: true,
		}
	}

	private handleRejectedProposal(
		request: CognitionRequest,
		response: CognitionResponse,
		validationResult: ValidationResult,
	): CognitionPipelineResult {
		const reason = validationResult.errors.map((e) => e.message).join("; ")
		this.events.emit("plan.rejected", {
			timestamp: new Date().toISOString(),
			source: "cognition-coordinator",
			proposalId: response.proposal.id as string,
			reason,
			validationResult,
		})

		this.recordRejectedDecision(response.proposal, reason, validationResult)

		this.logger.warn(`[CognitionCoordinator] Proposal "${response.proposal.name}" rejected: ${reason}`)

		return {
			request,
			response,
			proposal: response.proposal,
			validationResult,
			accepted: false,
		}
	}

	private recordDecision(
		proposal: PlanProposal,
		plan: Plan,
		validationResult: ValidationResult,
	): void {
		if (!this.decisionMemory) return

		const decisionId = DecisionMemory.generateId()
		this.decisionMemory.recordDecision({
			id: decisionId,
			proposalId: proposal.id as string,
			planId: plan.id as string,
			type: 'accepted',
			title: proposal.name,
			reasoning: `Proposal accepted with ${proposal.steps.length} steps`,
			validationResult: {
				valid: validationResult.valid,
				errors: validationResult.errors.map((e) => e.message),
				warnings: validationResult.warnings.map((w) => w.message),
			},
			timestamp: new Date().toISOString(),
		})

		this.events.emit("decision.recorded", {
			timestamp: new Date().toISOString(),
			source: "cognition-coordinator",
			memoryId: decisionId as string,
			decisionType: 'accepted',
			proposalId: proposal.id as string,
			title: proposal.name,
		})
	}

	private recordRejectedDecision(
		proposal: PlanProposal,
		reason: string,
		validationResult: ValidationResult,
	): void {
		if (!this.decisionMemory) return

		const decisionId = DecisionMemory.generateId()
		this.decisionMemory.recordDecision({
			id: decisionId,
			proposalId: proposal.id as string,
			type: 'rejected',
			title: proposal.name,
			reasoning: reason,
			validationResult: {
				valid: validationResult.valid,
				errors: validationResult.errors.map((e) => e.message),
				warnings: validationResult.warnings.map((w) => w.message),
			},
			timestamp: new Date().toISOString(),
		})

		this.events.emit("decision.recorded", {
			timestamp: new Date().toISOString(),
			source: "cognition-coordinator",
			memoryId: decisionId as string,
			decisionType: 'rejected',
			proposalId: proposal.id as string,
			title: proposal.name,
		})
	}

	/**
	 * Validate an existing proposal.
	 */
	validateProposal(proposal: PlanProposal): ValidationResult {
		return this.validator.validate(proposal)
	}

	/**
	 * Convert a validated proposal to a Plan for the planner.
	 *
	 * Does NOT re-validate — caller must validate first.
	 */
	static acceptProposal(proposal: PlanProposal, options: { sessionId?: string } = {}): Plan {
		return proposalToPlan(proposal, {
			sessionId: options.sessionId,
			resumable: true,
		})
	}
}
