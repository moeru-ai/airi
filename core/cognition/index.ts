/**
 * AIRI Core — Cognition Layer
 *
 * Barrel export for the structured cognition layer. The cognition layer
 * generates plan proposals from structured context — it does NOT execute
 * tools or control the runtime. The planner remains the sole execution
 * authority.
 */

// ── Types ────────────────────────────────────────────────────────────────

export { CognitionCoordinator } from './coordinator.js'

export type { CognitionPipelineResult } from './coordinator.js'

// ── Provider interface ──────────────────────────────────────────────────

export type {
  CognitionCompleted,
  CognitionEvent,
  CognitionFailed,
  CognitionRequested,
  PlanProposed,
  PlanRejected,
  PlanValidated,
} from './events.js'

// ── Events ───────────────────────────────────────────────────────────────

export {
  createProposal,
  extractCapabilityRequirements,
  extractWorkspaceRequirements,
  proposalToPlan,
  summarizeProposal,
} from './proposals.js'

// ── Proposal management ─────────────────────────────────────────────────

export type {
  CognitionProvider,
  CognitionProviderOptions,
} from './provider.js'

// ── Validator ────────────────────────────────────────────────────────────

export { MockCognitionProvider } from './providers/mock-provider.js'

// ── Mock provider ────────────────────────────────────────────────────────

export type {
  CognitionConstraints,
  CognitionContext,
  CognitionModel,
  CognitionRequest,
  CognitionResponse,
  CognitionSession,
  CognitionSessionId,
  EstimatedExecution,
  ExecutionSummary,
  ModelCapabilities,
  ModelInfo,
  PlanProposal,
  PlanSummary,
  ProposalId,
  ProposedStep,
  ReasoningEntry,
  ReasoningId,
  ReasoningTrace,
  TokenUsage,
  ValidationError,
  ValidationResult,
  ValidationWarning,
  WorkspaceRequirements,
} from './types.js'

// ── Coordinator ──────────────────────────────────────────────────────────

export {
  createCognitionSessionId,
  createProposalId,
  createReasoningId,
} from './types.js'
export { PlanValidator } from './validator.js'
