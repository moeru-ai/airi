/**
 * AIRI Core — Cognition Layer
 *
 * Barrel export for the structured cognition layer. The cognition layer
 * generates plan proposals from structured context — it does NOT execute
 * tools or control the runtime. The planner remains the sole execution
 * authority.
 */

// ── Types ────────────────────────────────────────────────────────────────

export type {
	ProposalId,
	ReasoningId,
	CognitionSessionId,
	CognitionRequest,
	CognitionContext,
	PlanSummary,
	ExecutionSummary,
	CognitionConstraints,
	CognitionResponse,
	ModelInfo,
	TokenUsage,
	PlanProposal,
	ProposedStep,
	WorkspaceRequirements,
	EstimatedExecution,
	ReasoningTrace,
	ReasoningEntry,
	CognitionModel,
	ModelCapabilities,
	CognitionSession,
	ValidationResult,
	ValidationError,
	ValidationWarning,
} from "./types.js"

export {
	createProposalId,
	createReasoningId,
	createCognitionSessionId,
} from "./types.js"

// ── Provider interface ──────────────────────────────────────────────────

export type {
	CognitionProvider,
	CognitionProviderOptions,
} from "./provider.js"

// ── Events ───────────────────────────────────────────────────────────────

export type {
	CognitionRequested,
	CognitionCompleted,
	CognitionFailed,
	PlanProposed,
	PlanValidated,
	PlanRejected,
	CognitionEvent,
} from "./events.js"

// ── Proposal management ─────────────────────────────────────────────────

export {
	createProposal,
	proposalToPlan,
	summarizeProposal,
	extractCapabilityRequirements,
	extractWorkspaceRequirements,
} from "./proposals.js"

// ── Validator ────────────────────────────────────────────────────────────

export { PlanValidator } from "./validator.js"

// ── Mock provider ────────────────────────────────────────────────────────

export { MockCognitionProvider } from "./providers/mock-provider.js"

// ── Coordinator ──────────────────────────────────────────────────────────

export { CognitionCoordinator } from "./coordinator.js"
export type { CognitionPipelineResult } from "./coordinator.js"
