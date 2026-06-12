/**
 * AIRI Core — Cognition Coordinator
 *
 * Coordinates the cognition pipeline:
 *   request → provider → proposal → validation → planner
 *
 * The coordinator ensures:
 * - Planner remains execution authority.
 * - Plans become immutable after validation.
 * - Rejected proposals are preserved for auditing.
 * - All steps are replayable via event emission.
 */

import type { CognitionProvider } from "./provider.js"
import type { PlanValidator } from "./validator.js"
import type {
	CognitionRequest,
	CognitionResponse,
	CognitionContext,
	PlanProposal,
	ReasoningId,
	ProposalId,
	ValidationResult,
} from "./types.js"
import type { Plan, PlanId } from "../planner/types.js"
import type { EventBus } from "../events/bus.js"
import type { Logger } from "../logger.js"
import type { EventStore } from "../persistence/types.js"
import type { CognitionConstraints } from "./types.js"
import { createReasoningId, createProposalId } from "./types.js"
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
 * request → provider → proposal → validation → planner
 *
 * The coordinator ensures:
 * - Planner remains execution authority
 * - Plans become immutable after validation
 * - Rejected proposals are preserved for auditing
 * - All steps are replayable
 */
export class CognitionCoordinator {
	private readonly provider: CognitionProvider
	private readonly validator: PlanValidator
	private readonly events: EventBus
	private readonly logger: Logger
	private readonly eventStore?: EventStore

	constructor(
		provider: CognitionProvider,
		validator: PlanValidator,
		events: EventBus,
		logger: Logger,
		options: { eventStore?: EventStore } = {},
	) {
		this.provider = provider
		this.validator = validator
		this.events = events
		this.logger = logger
		this.eventStore = options.eventStore
	}

	/**
	 * Generate a plan proposal from context.
	 *
	 * Flow:
	 * 1. Create cognition request
	 * 2. Call provider.generatePlanProposal
	 * 3. Emit cognition events
	 * 4. Validate proposal
	 * 5. Emit validation events
	 * 6. If valid, convert to Plan
	 * 7. Persist if event store configured
	 */
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

		// 1. Create cognition request.
		const request: CognitionRequest = {
			id: requestId,
			context,
			prompt,
			constraints: options.constraints,
			metadata: { sessionId: options.sessionId },
			createdAt: now,
		}

		// 2. Emit cognition.requested event.
		this.events.emit("cognition.requested", {
			timestamp: now,
			source: "cognition-coordinator",
			requestId: requestId as string,
			sessionId: options.sessionId,
			workspaceId: context.workspaceId,
		})

		// 3. Call provider.
		this.logger.info(`[CognitionCoordinator] Generating proposal for: "${prompt}"`)
		const response = await this.provider.generatePlanProposal(request)

		// 4. Emit cognition.completed event.
		const completedAt = new Date().toISOString()
		this.events.emit("cognition.completed", {
			timestamp: completedAt,
			source: "cognition-coordinator",
			requestId: requestId as string,
			proposalId: response.proposal.id as string,
			modelInfo: response.modelInfo,
			durationMs: response.durationMs,
		})

		// 5. Emit plan.proposed event.
		this.events.emit("plan.proposed", {
			timestamp: completedAt,
			source: "cognition-coordinator",
			proposalId: response.proposal.id as string,
			requestId: requestId as string,
			name: response.proposal.name,
			stepCount: response.proposal.steps.length,
			confidence: response.proposal.confidence,
		})

		// 6. Validate proposal.
		const validationResult = this.validator.validate(response.proposal)

		// 7. Emit validation events.
		if (validationResult.valid) {
			const plan = this.acceptProposal(response.proposal, { sessionId: options.sessionId })

			this.events.emit("plan.validated", {
				timestamp: new Date().toISOString(),
				source: "cognition-coordinator",
				proposalId: response.proposal.id as string,
				planId: plan.id as string,
				validationResult,
			})

			this.logger.info(`[CognitionCoordinator] Proposal "${response.proposal.name}" accepted (${response.proposal.steps.length} steps)`)

			return {
				request,
				response,
				proposal: response.proposal,
				validationResult,
				plan,
				accepted: true,
			}
		} else {
			// Rejected — emit plan.rejected event.
			const reason = validationResult.errors.map((e) => e.message).join("; ")
			this.events.emit("plan.rejected", {
				timestamp: new Date().toISOString(),
				source: "cognition-coordinator",
				proposalId: response.proposal.id as string,
				reason,
				validationResult,
			})

			this.logger.warn(`[CognitionCoordinator] Proposal "${response.proposal.name}" rejected: ${reason}`)

			return {
				request,
				response,
				proposal: response.proposal,
				validationResult,
				accepted: false,
			}
		}
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
	acceptProposal(proposal: PlanProposal, options: { sessionId?: string } = {}): Plan {
		return proposalToPlan(proposal, {
			sessionId: options.sessionId,
			resumable: true,
		})
	}
}
