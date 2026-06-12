/**
 * AIRI Core — Cognition Type Definitions
 *
 * Branded types and serializable structures for the structured cognition layer.
 * The cognition layer generates plan proposals from structured context — it
 * does NOT execute tools or control the runtime. The planner remains the sole
 * execution authority.
 *
 * Design principles:
 * - Branded IDs for type safety (ProposalId, ReasoningId, CognitionSessionId).
 * - All structures are serializable — no prompt-driven hidden state.
 * - Cognition is proposal-only: providers produce plans, not side effects.
 * - Deterministic validation: the validator, not the LLM, decides admissibility.
 */

import type { CapabilityId, ToolId } from "../capabilities/types.js"
import type { WorkspaceId } from "../workspace/types.js"
import type { PlanId, PlanSummary } from "../planner/types.js"

// ── Branded IDs ──────────────────────────────────────────────────────────

/**
 * Opaque proposal identifier.
 *
 * Created via createProposalId() to ensure brand safety at creation sites.
 */
export type ProposalId = string & { readonly __brand: 'ProposalId' }

/**
 * Opaque reasoning identifier.
 *
 * Created via createReasoningId() to ensure brand safety at creation sites.
 */
export type ReasoningId = string & { readonly __brand: 'ReasoningId' }

/**
 * Opaque cognition session identifier.
 *
 * Created via createCognitionSessionId() to ensure brand safety at creation sites.
 */
export type CognitionSessionId = string & { readonly __brand: 'CognitionSessionId' }

/**
 * Create a branded ProposalId from a raw string.
 */
export function createProposalId(raw: string): ProposalId {
	return raw as ProposalId
}

/**
 * Create a branded ReasoningId from a raw string.
 */
export function createReasoningId(raw: string): ReasoningId {
	return raw as ReasoningId
}

/**
 * Create a branded CognitionSessionId from a raw string.
 */
export function createCognitionSessionId(raw: string): CognitionSessionId {
	return raw as CognitionSessionId
}

// ── Cognition request ────────────────────────────────────────────────────

/**
 * Input to a cognition provider.
 *
 * Contains all structured context needed to generate a plan proposal.
 * Carries no hidden prompt state — everything is explicit and serializable.
 */
export interface CognitionRequest {
	/** Unique identifier for this reasoning request. */
	readonly id: ReasoningId

	/** Structured context for plan generation. */
	readonly context: CognitionContext

	/** The prompt or goal description. */
	readonly prompt: string

	/** Optional constraints on plan generation. */
	readonly constraints?: CognitionConstraints

	/** Arbitrary metadata (serializable). */
	readonly metadata: Record<string, unknown>

	/** ISO-8601 creation timestamp. */
	readonly createdAt: string
}

// ── Cognition context ────────────────────────────────────────────────────

/**
 * Structured context for plan generation.
 *
 * Provides the provider with all information needed to propose a plan:
 * available capabilities, workspaces, previous plans, execution history.
 */
export interface CognitionContext {
	/** Associated runtime session, if any. */
	readonly sessionId?: string

	/** Target workspace, if scoped. */
	readonly workspaceId?: WorkspaceId

	/** Associated repository, if any. */
	readonly repositoryId?: string

	/** Capabilities available for plan steps. */
	readonly availableCapabilities: CapabilityId[]

	/** Workspaces available for plan execution. */
	readonly availableWorkspaces: WorkspaceId[]

	/** Previous plans for context (e.g. to avoid repeating work). */
	readonly previousPlans?: PlanSummary[]

	/** Recent execution history for context. */
	readonly executionHistory?: ExecutionSummary[]

	/** Additional custom context (must be serializable). */
	readonly customContext?: Record<string, unknown>
}

/**
 * Summary of a previous plan for context.
 */
export interface PlanSummary {
	/** The plan's unique identifier. */
	readonly planId: PlanId

	/** Human-readable plan name. */
	readonly name: string

	/** Current plan status. */
	readonly status: string

	/** Number of steps in the plan. */
	readonly stepCount: number

	/** ISO-8601 completion timestamp, if completed. */
	readonly completedAt?: string
}

/**
 * Summary of a previous execution for context.
 */
export interface ExecutionSummary {
	/** The task's unique identifier. */
	readonly taskId: string

	/** The tool that was executed. */
	readonly toolId: ToolId

	/** Whether the execution succeeded. */
	readonly success: boolean

	/** Execution duration in milliseconds. */
	readonly durationMs: number

	/** ISO-8601 execution timestamp. */
	readonly timestamp: string
}

// ── Constraints ──────────────────────────────────────────────────────────

/**
 * Constraints on plan generation.
 *
 * These are hard limits — the provider must respect them.
 */
export interface CognitionConstraints {
	/** Maximum number of steps in the generated plan. */
	readonly maxSteps?: number

	/** Capabilities that must be available for the plan. */
	readonly requiredCapabilities?: CapabilityId[]

	/** Target workspace for plan execution. */
	readonly targetWorkspace?: WorkspaceId

	/** Maximum time in milliseconds for plan generation. */
	readonly timeoutMs?: number

	/** Whether the plan may include parallel steps. */
	/** @default true */
	readonly allowParallelSteps?: boolean
}

// ── Cognition response ───────────────────────────────────────────────────

/**
 * Output from a cognition provider.
 *
 * Contains the plan proposal, reasoning trace, and model metadata.
 */
export interface CognitionResponse {
	/** The request this response corresponds to. */
	readonly requestId: ReasoningId

	/** The generated plan proposal. */
	readonly proposal: PlanProposal

	/** Replayable record of cognitive reasoning. */
	readonly reasoning: ReasoningTrace

	/** Model information for auditing. */
	readonly modelInfo: ModelInfo

	/** Token/resource accounting, if available. */
	readonly tokenUsage?: TokenUsage

	/** Total generation duration in milliseconds. */
	readonly durationMs: number

	/** ISO-8601 completion timestamp. */
	readonly completedAt: string
}

// ── Model info ────────────────────────────────────────────────────────────

/**
 * Provider-agnostic model identification.
 */
export interface ModelInfo {
	/** Model provider (e.g. "openai", "anthropic", "local"). */
	readonly provider: string

	/** Model identifier (e.g. "gpt-4", "claude-3", "mock"). */
	readonly model: string

	/** Optional model version identifier. */
	readonly version?: string
}

/**
 * Token/resource accounting.
 */
export interface TokenUsage {
	/** Input tokens consumed. */
	readonly inputTokens?: number

	/** Output tokens generated. */
	readonly outputTokens?: number

	/** Total tokens used. */
	readonly totalTokens?: number

	/** Estimated cost in smallest currency unit (e.g. cents). */
	readonly estimatedCost?: number
}

// ── Plan proposal ────────────────────────────────────────────────────────

/**
 * The core output of cognition — a proposed plan with metadata.
 *
 * Proposals are immutable after creation. They must pass validation
 * before being converted to a Planner Plan.
 */
export interface PlanProposal {
	/** Unique proposal identifier. */
	readonly id: ProposalId

	/** The request that generated this proposal. */
	readonly requestId: ReasoningId

	/** Human-readable proposal name. */
	readonly name: string

	/** Optional description of the proposal's intent. */
	readonly description?: string

	/** Proposed steps. */
	readonly steps: ProposedStep[]

	/** Capabilities required by this proposal. */
	readonly capabilityRequirements: CapabilityId[]

	/** Workspace requirements for execution. */
	readonly workspaceRequirements: WorkspaceRequirements[]

	/** Estimated execution metadata. */
	readonly estimatedExecution?: EstimatedExecution

	/** Model's self-reported confidence (0-1). */
	readonly confidence?: number

	/** Arbitrary metadata (serializable). */
	readonly metadata: Record<string, unknown>

	/** ISO-8601 creation timestamp. */
	readonly createdAt: string
}

/**
 * A single proposed step within a plan.
 */
export interface ProposedStep {
	/** Temporary ID — replaced with StepId during validation. */
	readonly id: string

	/** Human-readable step name. */
	readonly name: string

	/** Optional description. */
	readonly description?: string

	/** Tool ID or action type. */
	readonly action: string

	/** Action-specific input parameters. */
	readonly input: Record<string, unknown>

	/** IDs of steps this depends on. */
	readonly dependencyIds?: string[]

	/** Capability required to execute this step. */
	readonly capabilityRequirement?: CapabilityId

	/** Workspace required for this step. */
	readonly workspaceRequirement?: WorkspaceId

	/** Per-step timeout in milliseconds. */
	readonly timeoutMs?: number

	/** Why this step was proposed (model reasoning). */
	readonly reasoning?: string
}

/**
 * Workspace requirements for a plan.
 */
export interface WorkspaceRequirements {
	/** Required workspace, if any. */
	readonly workspaceId?: WorkspaceId

	/** Required repository, if any. */
	readonly repositoryId?: string

	/** Required branch name, if any. */
	readonly branchName?: string

	/** Capabilities required in this workspace. */
	readonly requiredCapabilities?: CapabilityId[]
}

/**
 * Estimated execution metadata.
 */
export interface EstimatedExecution {
	/** Estimated number of steps. */
	readonly estimatedStepCount: number

	/** Estimated total duration in milliseconds. */
	readonly estimatedDurationMs?: number

	/** Estimated tool call counts by tool. */
	readonly estimatedToolCalls?: Record<ToolId, number>

	/** Number of steps that can execute in parallel. */
	readonly parallelizableStepCount?: number
}

// ── Reasoning trace ──────────────────────────────────────────────────────

/**
 * Replayable record of cognitive reasoning.
 *
 * Provides full transparency into how a proposal was generated.
 * Entries are append-only and ordered chronologically.
 */
export interface ReasoningTrace {
	/** Unique reasoning trace identifier. */
	readonly id: ReasoningId

	/** The proposal this trace produced. */
	readonly proposalId: ProposalId

	/** Chronological reasoning entries. */
	readonly entries: ReasoningEntry[]

	/** Optional summary of the reasoning process. */
	readonly summary?: string

	/** Model that produced this reasoning. */
	readonly modelInfo: ModelInfo

	/** ISO-8601 start timestamp. */
	readonly startedAt: string

	/** ISO-8601 completion timestamp, if completed. */
	readonly completedAt?: string
}

/**
 * A single reasoning entry within a trace.
 */
export interface ReasoningEntry {
	/** ISO-8601 timestamp of this entry. */
	readonly timestamp: string

	/** Type of reasoning entry. */
	readonly type: "analysis" | "decision" | "observation" | "revision" | "conclusion"

	/** Human-readable reasoning content. */
	readonly content: string

	/** IDs of steps related to this reasoning entry. */
	readonly relatedStepIds?: string[]

	/** Additional metadata (serializable). */
	readonly metadata?: Record<string, unknown>
}

// ── Model capabilities ───────────────────────────────────────────────────

/**
 * Describes a cognition model's capabilities.
 */
export interface CognitionModel {
	/** Model provider. */
	readonly provider: string

	/** Model identifier. */
	readonly model: string

	/** Specific capabilities of this model. */
	readonly capabilities: ModelCapabilities

	/** Context window size in tokens, if known. */
	readonly contextWindow?: number

	/** Maximum output tokens, if known. */
	readonly maxOutputTokens?: number

	/** Whether the model supports streaming responses. */
	readonly supportsStreaming?: boolean

	/** Whether the model supports tool use. */
	readonly supportsToolUse?: boolean
}

/**
 * Capabilities of a cognition model.
 */
export interface ModelCapabilities {
	/** Can generate plan proposals. */
	readonly canGeneratePlans: boolean

	/** Can analyze code. */
	readonly canAnalyzeCode: boolean

	/** Can reason about code dependencies. */
	readonly canReasonAboutDependencies: boolean

	/** Can estimate effort/duration. */
	readonly canEstimateEffort: boolean

	/** Action types the model can propose. */
	readonly supportedStepActions?: string[]
}

// ── Cognition session ────────────────────────────────────────────────────

/**
 * Tracks a cognition interaction across multiple requests.
 */
export interface CognitionSession {
	/** Unique session identifier. */
	readonly id: CognitionSessionId

	/** Associated runtime session, if any. */
	readonly sessionId?: string

	/** Requests made in this session. */
	readonly requests: ReasoningId[]

	/** ISO-8601 creation timestamp. */
	readonly createdAt: string

	/** ISO-8601 last-update timestamp. */
	readonly updatedAt: string
}

// ── Validation result ────────────────────────────────────────────────────

/**
 * Result of validating a plan proposal.
 */
export interface ValidationResult {
	/** Whether the proposal passed validation. */
	readonly valid: boolean

	/** Validation errors (fatal). */
	readonly errors: ValidationError[]

	/** Validation warnings (non-fatal). */
	readonly warnings: ValidationWarning[]

	/** Number of steps after normalization. */
	readonly normalizedSteps?: number
}

/**
 * A validation error that prevents proposal acceptance.
 */
export interface ValidationError {
	/** Machine-readable error code. */
	readonly code: string

	/** Human-readable error message. */
	readonly message: string

	/** Step ID where the error occurred, if applicable. */
	readonly stepId?: string
}

/**
 * A validation warning (non-fatal).
 */
export interface ValidationWarning {
	/** Machine-readable warning code. */
	readonly code: string

	/** Human-readable warning message. */
	readonly message: string

	/** Step ID where the warning occurred, if applicable. */
	readonly stepId?: string
}
