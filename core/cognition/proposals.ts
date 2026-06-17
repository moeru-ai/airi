/**
 * AIRI Core — Plan Proposal Management
 *
 * Functions for creating, converting, and summarizing plan proposals.
 * Proposals bridge the gap between cognition (proposal generation) and
 * planning (execution).
 *
 * Design principles:
 * - Proposals are immutable after creation.
 * - Conversion to Plans replaces temporary IDs with proper branded IDs.
 * - Capability and workspace requirements are extracted from steps.
 */

import type {
	PlanProposal,
	ProposedStep,
	ReasoningId,
	PlanSummary,
	WorkspaceRequirements,
} from "./types.js"
import type { Plan, PlanStep, PlanId, StepId } from "../planner/types.js"
import type { CapabilityId } from "../capabilities/types.js"
import { createProposalId } from "./types.js"
import { createPlanId, createStepId } from "../planner/types.js"

// ── Proposal creation ────────────────────────────────────────────────────

/**
 * Create a new plan proposal.
 *
 * @param requestId - The reasoning request that generated this proposal.
 * @param name - Human-readable proposal name.
 * @param steps - Proposed steps.
 * @param options - Optional metadata.
 * @returns A new immutable plan proposal.
 */
export function createProposal(
	requestId: ReasoningId,
	name: string,
	steps: ProposedStep[],
	options: {
		description?: string
		capabilityRequirements?: CapabilityId[]
		workspaceRequirements?: WorkspaceRequirements[]
		confidence?: number
	} = {},
): PlanProposal {
	const id = createProposalId(`prop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
	const capabilityRequirements = options.capabilityRequirements ?? extractCapabilityRequirements(steps)
	const workspaceRequirements = options.workspaceRequirements ?? extractWorkspaceRequirements(steps)

	return {
		id,
		requestId,
		name,
		description: options.description,
		steps,
		capabilityRequirements,
		workspaceRequirements,
		estimatedExecution: {
			estimatedStepCount: steps.length,
			parallelizableStepCount: steps.filter((s) => !s.dependencyIds || s.dependencyIds.length === 0).length,
		},
		confidence: options.confidence,
		metadata: {},
		createdAt: new Date().toISOString(),
	}
}

// ── Proposal to Plan conversion ──────────────────────────────────────────

/**
 * Convert a validated proposal into a Plan for the planner.
 *
 * This is the bridge between cognition and execution.
 * The proposal's temporary step IDs are replaced with proper StepIds.
 *
 * @param proposal - The validated plan proposal.
 * @param options - Conversion options.
 * @returns A Plan ready for the planner.
 */
export function proposalToPlan(
	proposal: PlanProposal,
	options: {
		planId?: PlanId
		sessionId?: string
		resumable?: boolean
	} = {},
): Plan {
	const planId = options.planId ?? createPlanId(`plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)

	// Map temporary step IDs to proper StepIds.
	const tempToStepId = new Map<string, StepId>()
	for (const step of proposal.steps) {
		tempToStepId.set(step.id, createStepId(`step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`))
	}

	const steps: PlanStep[] = proposal.steps.map((proposed) => {
		const stepId = tempToStepId.get(proposed.id)!
		const dependencies = proposed.dependencyIds
			?.map((depId) => tempToStepId.get(depId))
			.filter((id): id is StepId => id !== undefined) ?? []

		return {
			id: stepId,
			name: proposed.name,
			description: proposed.description,
			action: proposed.action,
			input: { ...proposed.input },
			dependencyIds: dependencies,
			timeoutMs: proposed.timeoutMs ?? 30_000,
			status: "pending" as const,
		}
	})

	return {
		id: planId,
		name: proposal.name,
		description: proposal.description,
		steps,
		status: "draft",
		sessionId: options.sessionId,
		createdAt: new Date().toISOString(),
		metadata: {
			proposalId: proposal.id as string,
			confidence: proposal.confidence,
			...proposal.metadata,
		},
	}
}

// ── Proposal summarization ───────────────────────────────────────────────

/**
 * Summarize a proposal for context (for subsequent cognition requests).
 */
export function summarizeProposal(proposal: PlanProposal): PlanSummary {
	return {
		planId: proposal.id,
		name: proposal.name,
		status: "proposed",
		stepCount: proposal.steps.length,
	}
}

// ── Requirement extraction ───────────────────────────────────────────────

/**
 * Extract capability requirements from proposed steps.
 */
export function extractCapabilityRequirements(steps: ProposedStep[]): CapabilityId[] {
	const capabilities = new Set<CapabilityId>()
	for (const step of steps) {
		if (step.capabilityRequirement) {
			capabilities.add(step.capabilityRequirement)
		}
	}
	return [...capabilities]
}

/**
 * Extract workspace requirements from proposed steps.
 */
export function extractWorkspaceRequirements(steps: ProposedStep[]): WorkspaceRequirements[] {
	const requirements = new Map<string, WorkspaceRequirements>()
	for (const step of steps) {
		if (step.workspaceRequirement) {
			const key = step.workspaceRequirement as string
			if (!requirements.has(key)) {
				requirements.set(key, { workspaceId: step.workspaceRequirement })
			}
		}
	}
	return [...requirements.values()]
}
