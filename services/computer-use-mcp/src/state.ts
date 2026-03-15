/**
 * Run-level state manager.
 *
 * Maintains a unified, continuously updated picture of the current
 * execution environment so that downstream strategy / workflow layers
 * can make informed decisions without re-querying every subsystem.
 *
 * State is **ephemeral** — it lives for the duration of the MCP server
 * process. Persistent audit lives in session trace / JSONL.
 */

import type { TaskMemory } from './task-memory/types'
import type {
  BrowserSurfaceAvailability,
  DisplayInfo,
  ExecutionTarget,
  ForegroundContext,
  LastScreenshotInfo,
  PolicyDecision,
  PtyApprovalGrant,
  PtyAuditEntry,
  SurfaceDecision,
  TerminalCommandResult,
  TerminalState,
  VscodeControllerState,
  VscodeProblem,
  WindowObservation,
  WorkflowStepTerminalBinding,
} from './types'

import { appNamesMatch } from './app-aliases'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskPhase
  = | 'idle'
    | 'planning'
    | 'executing'
    | 'awaiting_approval'
    | 'recovering'
    | 'reroute_required'
    | 'completed'
    | 'failed'

/** Lightweight snapshot of a PTY session stored in RunState. */
export interface PtySessionState {
  /** Session id (e.g. "pty_1"). */
  id: string
  /** Whether the underlying process is still alive. */
  alive: boolean
  /** Terminal dimensions. */
  rows: number
  cols: number
  /** Process PID. */
  pid: number
  /** Working directory at creation time. */
  cwd?: string
  /** Stable workflow step id that created this session (if any). */
  boundStepId?: string
  /**
   * @deprecated Use `boundStepId`. Kept for backward-compat logging only.
   */
  boundWorkflowStepLabel?: string
  /** ISO timestamp when the session was created. */
  createdAt: string
  /** ISO timestamp of last interaction (write/read). */
  lastInteractionAt?: string
}

export interface TaskStep {
  /** Sequential 1-based index within the current task. */
  index: number
  /** Stable unique id for binding/recovery (e.g. "step_<uuid>"). */
  stepId: string
  /** Human-readable label, e.g. "Open Terminal" */
  label: string
  /** MCP tool invoked, e.g. "desktop_open_app" */
  toolName?: string
  /** Outcome after execution. */
  outcome?: 'success' | 'failure' | 'skipped' | 'pending_approval' | 'rejected' | 'reroute_required'
  /** Short explanation of the outcome. */
  outcomeReason?: string
  /** ISO timestamp when started. */
  startedAt?: string
  /** ISO timestamp when finished. */
  finishedAt?: string
}

export interface ActiveTask {
  /** Unique identifier. */
  id: string
  /** Human-readable goal description. */
  goal: string
  /** Workflow template id (if driven by a workflow). */
  workflowId?: string
  phase: TaskPhase
  /** Ordered list of steps planned / executed so far. */
  steps: TaskStep[]
  /** Index of the currently executing step (0-based into `steps`). */
  currentStepIndex: number
  /** ISO timestamp when the task started. */
  startedAt: string
  /** ISO timestamp when the task finished (completed / failed). */
  finishedAt?: string
  /** Accumulated failure count within this task. */
  failureCount: number
  /** Maximum tolerable consecutive failures before aborting. */
  maxConsecutiveFailures: number
}

// ---------------------------------------------------------------------------
// Coding Core Types
// ---------------------------------------------------------------------------

export interface CodingWorkspaceReview {
  workspacePath: string
  gitSummary: string
  terminalSurface: 'exec' | 'pty' | 'unknown'
  terminalStateSummary: {
    effectiveCwd?: string
    lastExitCode?: number
    lastCommandSummary?: string
  }
  recentReads: Array<{ path: string, range?: string }>
  recentEdits: Array<{ path: string, summary?: string }>
  recentCommandResults: string[]
  recentSearches: string[]
  pendingIssues: string[]
}

export type CodingTargetSourceKind = 'explicit' | 'symbol' | 'text' | 'references'

export interface CodingTargetCandidate {
  filePath: string
  sourceKind: CodingTargetSourceKind
  sourceLabel: string
  score: number
  matchCount: number
  inScopedPath: boolean
  recentlyEdited: boolean
  recentlyRead: boolean
  reasons: string[]
}

export interface CodingTargetCompetitionItem {
  filePath: string
  score: number
  targetKind: CodingTargetKind
  evidenceChain: string[]
}

export interface CodingTargetCompetition {
  winner?: CodingTargetCompetitionItem
  runnerUp?: CodingTargetCompetitionItem
  whyNotRunnerUp?: string
}

export interface CodingTargetSelection {
  status: 'selected' | 'ambiguous' | 'no_match'
  selectedFile?: string
  targetKind?: CodingTargetKind
  architectureLayer?: CodingArchitectureLayer
  intentDecomposition?: CodingIntentDecomposition
  candidates: CodingTargetCandidate[]
  reason: string
  recommendedNextAction: string
  missingInformation?: string[]
  changeIntent?: CodingChangeIntent
  selectedHypothesisId?: string
  hypotheses?: CodingTargetHypothesis[]
  ambiguityReason?: string
  evidenceChain?: string[]
  competition?: CodingTargetCompetition
}

export type CodingChangeIntent
  = | 'behavior_fix'
    | 'refactor'
    | 'api_change'
    | 'config_change'
    | 'test_fix'

export type CodingArchitectureLayer
  = | 'ui'
    | 'store'
    | 'protocol'
    | 'validation'
    | 'test'
    | 'unknown'

export type CodingIntentDecomposition
  = | 'bugfix'
    | 'refactor'
    | 'api_change'
    | 'wiring'
    | 'test_only'

export type CodingTargetKind = 'definition' | 'callsite' | 'config' | 'test' | 'wiring'

export interface CodingImpactGraphNode {
  id: string
  filePath: string
  kind: 'symbol_owner' | 'reference' | 'import_neighbor' | 'test_candidate' | 'companion_file'
  symbolName?: string
  distance: 0 | 1
}

export interface CodingImpactGraphEdge {
  from: string
  to: string
  relation: 'owns_symbol' | 'references' | 'imports' | 'tests' | 'companions'
}

export interface CodingImpactGraphSnapshot {
  maxDepth: 1
  truncated: boolean
  nodes: CodingImpactGraphNode[]
  edges: CodingImpactGraphEdge[]
}

export interface CodingImpactAnalysis {
  status: 'ok' | 'unsupported' | 'no_match'
  targetFile?: string
  targetSymbol?: string
  searchQuery?: string
  languageSupport: 'js_ts' | 'unsupported'
  explanation: string
  targetCandidates: CodingTargetCandidate[]
  symbolOwner?: {
    symbolName: string
    definitionFile: string
  }
  importExportNeighbors: string[]
  directReferences: Array<{
    file: string
    line: number
    column: number
    isWriteAccess?: boolean
  }>
  likelyImpactedTests: string[]
  likelyCompanionFiles: string[]
  graphSnapshot: CodingImpactGraphSnapshot
}

export interface CodingTargetHypothesis {
  id: string
  filePath: string
  targetKind: CodingTargetKind
  changeIntent: CodingChangeIntent
  score: number
  confidence: number
  evidence: string[]
}

export interface CodingInvestigation {
  at: string
  trigger:
    | 'target_ambiguity'
    | 'patch_verification_mismatch'
    | 'validation_failed'
    | 'validation_timed_out'
    | 'unexpected_impacted_file_discovered'
  summary: string
  evidence: string[]
  recommendedAction: string
}

export type CodingPlanSessionStatus = 'draft' | 'active' | 'investigating' | 'amended' | 'completed' | 'aborted'

export interface CodingPlanSessionStep {
  filePath: string
  intent: CodingChangeIntent
  source: 'target_selection' | 'search' | 'explicit'
  status:
    | 'blocked_by_dependency'
    | 'awaiting_checkpoint'
    | 'ready'
    | 'in_progress'
    | 'validated'
    | 'needs_replan'
    | 'abandoned'
  dependsOn?: string[]
  checkpoint?: 'none' | 'validation_required_before_next'
}

export interface CodingPlanSessionTransition {
  at: string
  filePath: string
  from: CodingPlanSessionStep['status']
  to: CodingPlanSessionStep['status']
  reason: string
}

export interface CodingPlannerCandidateScore {
  filePath: string
  status: 'ready' | 'in_progress'
  score: number
  reasons: string[]
}

export interface CodingPlannerDecision {
  selectedFile: string
  candidateScores: CodingPlannerCandidateScore[]
  decisionReason: string
  selectionMode: 'resume_current' | 'dependency_ready' | 'recovery_retry' | 'follow_dependency_chain'
  whyNotRunnerUp?: {
    winner: {
      filePath: string
      score: number
      reasons: string[]
    }
    runnerUp?: {
      filePath: string
      score: number
      reasons: string[]
    }
    explanation: string
  }
}

export type CodingPlanNodeStatus
  = | 'blocked'
    | 'ready'
    | 'running'
    | 'awaiting_checkpoint'
    | 'validated'
    | 'needs_replan'
    | 'aborted'

export type CodingPlanHierarchyLayer = 'task' | 'subtask' | 'file'

export interface CodingPlanTaskNode {
  id: string
  layer: 'task'
  sessionId: string
  title: string
  changeIntent: CodingChangeIntent
  maxFiles: 1 | 2 | 3
  status: 'active' | 'completed' | 'aborted'
}

export interface CodingPlanSubtaskNode {
  id: string
  layer: 'subtask'
  parentTaskId: string
  fileNodeId: string
  filePath: string
  title: string
  intent: CodingChangeIntent
  status: CodingPlanNodeStatus
  order: number
}

export interface CodingPlanNode {
  id: string
  filePath: string
  intent: CodingChangeIntent
  source: 'target_selection' | 'search' | 'explicit'
  status: CodingPlanNodeStatus
  checkpoint: 'none' | 'validation_required_before_next'
  dependsOn: string[]
  order: number
}

export interface CodingPlanEdge {
  from: string
  to: string
  relation: 'depends_on' | 'task_contains_subtask' | 'subtask_targets_file'
}

export interface CodingPlanGraph {
  version: 1
  sessionId: string
  generatedAt: string
  maxNodes: number
  maxNodesHardLimit: 5
  amendBudget: {
    limit: number
    used: number
  }
  backtrackBudget: {
    limit: number
    used: number
  }
  taskNodes: CodingPlanTaskNode[]
  subtaskNodes: CodingPlanSubtaskNode[]
  nodes: CodingPlanNode[]
  edges: CodingPlanEdge[]
}

export interface CodingPlanFrontier {
  generatedAt: string
  activeTaskNodeId?: string
  readySubtaskIds: string[]
  blockedSubtaskIds: string[]
  readyNodeIds: string[]
  blockedNodeIds: string[]
  blockedReasons: Array<{
    nodeId: string
    reason: 'dependency_not_validated' | 'checkpoint_pending' | 'node_not_ready'
    details: string[]
  }>
}

export interface CodingPlanDraftNode {
  filePath: string
  dependsOn: string[]
  checkpoint: 'none' | 'validation_required_before_next'
  reason: string
}

export interface CodingPlanDraft {
  generatedAt: string
  mode: 'initial' | 'replan'
  nodes: CodingPlanDraftNode[]
  rationale: string
}

export interface TargetDecisionCaseCandidate {
  filePath: string
  targetKind: CodingTargetKind
  sourceKind: CodingTargetSourceKind
  roleHints: Array<'definition' | 'reference' | 'test' | 'config' | 'wiring'>
  impactNeighbors: string[]
  recentlyEdited: boolean
  recentlyRead: boolean
  failingTestHit: boolean
  score: number
  evidence: string[]
}

export interface TargetDecisionCase {
  preparedAt: string
  changeIntent: CodingChangeIntent
  candidates: TargetDecisionCaseCandidate[]
  currentPlannerFrontier: string[]
  missingInformationHints: string[]
}

export interface TargetJudgementScore {
  filePath: string
  score: number
  reason: string
}

export interface TargetJudgement {
  winner: string
  runnerUp?: string
  candidateScores: TargetJudgementScore[]
  winnerReason: string
  runnerUpReason?: string
  whyNotRunnerUp?: string
  missingInformation: string[]
  targetKind: CodingTargetKind
  architectureLayer: CodingArchitectureLayer
  intentDecomposition: CodingIntentDecomposition
  mode: 'judge' | 'fallback_deterministic'
}

export type CodingJudgeRootCauseType
  = | 'wrong_target'
    | 'missed_dependency'
    | 'incomplete_change'
    | 'baseline_noise'
    | 'validation_command_mismatch'
    | 'test_only_breakage'

export interface CodingCounterfactualCheck {
  id: string
  hypothesis: CodingJudgeRootCauseType
  expectedObservation: string
  observedEvidence: string[]
  passed: boolean
  rationale: string
}

export interface DiagnosisCase {
  preparedAt: string
  taskGoal: string
  changeIntent: CodingChangeIntent
  currentNode?: string
  changedFiles: string[]
  touchedSymbols: string[]
  impactCompanions: string[]
  failingTests: string[]
  stderrSignature?: string
  baselineComparison: 'new_red' | 'baseline_noise' | 'unknown'
  scopedValidationCommand?: string
  unresolvedIssues: string[]
  candidateRootCauses: CodingDiagnosisCandidateScore[]
}

export interface DiagnosisJudgement {
  winner: CodingJudgeRootCauseType
  runnerUp?: CodingJudgeRootCauseType
  candidateScores: Array<{
    rootCauseType: CodingJudgeRootCauseType
    score: number
    reason: string
  }>
  winnerReason: string
  runnerUpReason?: string
  disambiguationSignals: string[]
  conflictingEvidence: string[]
  counterfactualChecks: CodingCounterfactualCheck[]
  recommendedNextAction: 'amend' | 'abort' | 'continue'
  recommendedRepairWindow: {
    scope: 'current_file' | 'dependency_slice' | 'plan_window' | 'workspace'
    files: string[]
    reason: string
  }
  mode: 'judge' | 'fallback_deterministic'
}

export interface CodingPlanSession {
  id: string
  createdAt: string
  updatedAt: string
  status: CodingPlanSessionStatus
  amendCount: number
  backtrackCount: number
  maxAmendCount: 2
  maxBacktrackCount: 1
  maxFiles: 1 | 2 | 3
  changeIntent: CodingChangeIntent
  steps: CodingPlanSessionStep[]
  recentTransitions?: CodingPlanSessionTransition[]
  reason: string
}

export type CodingChangeRootCauseType
  = | 'wrong_target'
    | 'incomplete_change'
    | 'missed_dependency'
    | 'test_only_breakage'
    | 'baseline_noise'
    | 'validation_command_mismatch'
    | 'validation_environment_issue'
    | 'unknown'

export interface DiagnosisEvidence {
  changedFiles: string[]
  touchedSymbols: string[]
  impactCompanions: string[]
  failingTests: string[]
  stderrSignature?: string
  baselineComparison: 'new_red' | 'baseline_noise' | 'unknown'
  scopedValidationCommand?: string
  strongestSignals: string[]
}

export interface CausalLink {
  from: string
  to: CodingChangeRootCauseType
  reason: string
  strength: number
}

export interface CodingDiagnosisConfidenceBreakdown {
  candidateScores: CodingDiagnosisCandidateScore[]
  winnerMargin: number
  competition: CodingDiagnosisCompetition
}

export interface CodingDiagnosisCandidateScore {
  rootCauseType: CodingChangeRootCauseType
  score: number
  signals: string[]
}

export interface CodingDiagnosisConflict {
  signal: string
  winnerSupports: boolean
  runnerUpSupports: boolean
  resolution: 'favor_winner' | 'favor_runner_up' | 'tie'
  reason: string
}

export interface CodingDiagnosisCompetition {
  winner: CodingDiagnosisCandidateScore
  runnerUp: CodingDiagnosisCandidateScore
  winnerReason: string
  runnerUpReason: string
  whyNotRunnerUpReason: string
  disambiguationSignals: string[]
  contestedSignals: string[]
  conflicts: CodingDiagnosisConflict[]
}

export interface CodingChangeDiagnosis {
  rootCauseType: CodingChangeRootCauseType
  confidence: number
  evidence: string[]
  affectedFiles: string[]
  evidenceMatrix?: DiagnosisEvidence
  causalHints?: string[]
  causalLinks?: CausalLink[]
  confidenceBreakdown?: CodingDiagnosisConfidenceBreakdown
  contestedSignals?: string[]
  conflictingEvidence?: string[]
  counterfactualChecks?: CodingCounterfactualCheck[]
  recommendedRepairWindow?: {
    scope: 'current_file' | 'dependency_slice' | 'plan_window' | 'workspace'
    files: string[]
    reason: string
  }
  nextAction: 'amend' | 'abort' | 'continue'
  recommendedAction: string
  shouldAmendPlan: boolean
  shouldAbortPlan: boolean
}

export interface CodingDiagnosisJudgeInput {
  preparedAt: string
  taskIntent: CodingChangeIntent
  currentFilePath?: string
  currentPlanStep?: {
    filePath: string
    status: string
    dependsOn: string[]
    checkpoint?: string
  }
  diffSummary: string
  touchedSymbols: string[]
  impactedCompanions: string[]
  failingTests: string[]
  stderrSignature?: string
  baselineComparison: 'new_red' | 'baseline_noise' | 'unknown'
  scopedValidationCommand?: string
  candidateRootCauses: CodingDiagnosisCandidateScore[]
  competition: {
    winner: CodingDiagnosisCandidateScore
    runnerUp: CodingDiagnosisCandidateScore
    whyNotRunnerUp: string
  }
}

export interface CodingReplanDraftInput {
  preparedAt: string
  taskIntent: CodingChangeIntent
  currentTarget?: string
  diagnosis: {
    rootCauseType: CodingChangeRootCauseType
    nextAction: CodingChangeDiagnosis['nextAction']
    confidence: number
  }
  planBudget: {
    maxFiles: number
    filesUsed: number
    maxAmendCount: number
    amendUsed: number
    maxBacktrackCount: number
    backtrackUsed: number
  }
  dependencyHints: {
    impactedCompanions: string[]
    referenceFiles: string[]
    likelyTests: string[]
  }
  candidateNextFiles: CodingPlannerCandidateScore[]
}

export type CodingCausalTraceNodeKind = 'signal' | 'hypothesis' | 'decision'

export interface CodingCausalTraceNode {
  id: string
  kind: CodingCausalTraceNodeKind
  label: string
  metadata?: Record<string, string | number | boolean>
}

export interface CodingCausalTraceEdge {
  from: string
  to: string
  relation: 'supports' | 'competes_with' | 'drives'
  strength: number
  source: 'review_risk' | 'impact_analysis' | 'validation_output' | 'competition' | 'counterfactual'
}

export interface CodingCausalTrace {
  traceId: string
  createdAt: string
  rootCauseType: CodingChangeRootCauseType
  nodes: CodingCausalTraceNode[]
  edges: CodingCausalTraceEdge[]
  counterfactualChecks: CodingCounterfactualCheck[]
}

export interface CodingValidationBaseline {
  capturedAt: string
  workspacePath: string
  baselineDirtyFiles: string[]
  baselineDiffSummary: string
  baselineFailingChecks: string[]
  baselineFailureSignature?: string
  baselineFailingTests?: string[]
  baselineValidationOutputExcerpt?: string
  baselineSkippedValidations: string[]
  workspaceMetadata: {
    gitAvailable: boolean
    worktreePath?: string
    sourceWorkspacePath?: string
  }
}

export interface CodingPlanStep {
  filePath: string
  intent: string
  source: 'target_selection' | 'search' | 'explicit'
  status: 'pending' | 'completed' | 'blocked'
  dependsOn?: string[]
  checkpoint?: 'none' | 'validation_required_before_next'
}

export interface CodingChangePlan {
  maxPlannedFiles: 1 | 2 | 3
  diffBaselineFiles: string[]
  steps: CodingPlanStep[]
  reason: string
}

export type CodingReviewRisk
  = | 'validation_failed'
    | 'validation_timed_out'
    | 'no_validation_run'
    | 'patch_verification_mismatch'
    | 'unexpected_files_touched'
    | 'baseline_diff_escape'
    | 'unresolved_issues_remain'

export interface CodingChangeReview {
  status: 'ready_for_next_file' | 'needs_follow_up' | 'blocked' | 'failed'
  checkpointStatus?: 'passed' | 'pending_next_file' | 'needs_recovery'
  filesReviewed: string[]
  diffSummary: string
  diffPatchExcerpt?: string
  validationSummary: string
  validationCommand?: string
  baselineComparison?: 'new_red' | 'baseline_noise' | 'unknown'
  detectedRisks: CodingReviewRisk[]
  unresolvedIssues: string[]
  recommendedNextAction: string
  nextExecutableFile?: string
  nextExecutableReason?: string
  plannerDecisionRef?: {
    selectedFile: string
    selectionMode: CodingPlannerDecision['selectionMode']
    decisionReason: string
  }
}

export interface CodingScopedValidationCommand {
  command: string
  scope: 'file' | 'module' | 'workspace'
  reason: string
  filePath?: string
  resolvedAt: string
}

export interface CodingContextSnapshot {
  goal: string
  filesSummary: string
  recentResultSummary: string
  unresolvedIssues: string
  nextStepRecommendation: string
}

export interface CodingExecutionReport {
  status: 'completed' | 'in_progress' | 'blocked' | 'failed'
  summary: string
  filesTouched: string[]
  commandsRun: string[]
  checks: string[]
  nextStep: string
}

export interface CodingCompactionMeta {
  compactionCount: number
  lastCompactedAt: string
  lastTrigger: 'update' | 'round_refresh'
  compactedBuckets: string[]
  droppedItems: number
}

export interface CodingRoundContext {
  refreshedAt: string
  activeFile?: string
  activeIntent?: CodingChangeIntent
  sessionStatus?: CodingPlanSessionStatus
  unresolvedRisks: CodingReviewRisk[]
  unresolvedIssues: string[]
  nextStepHint?: string
  anchors: string[]
}

export interface CodingRunState {
  workspacePath: string
  gitSummary: string
  recentReads: Array<{ path: string, range?: string }>
  recentEdits: Array<{ path: string, summary?: string }>
  recentCommandResults: string[]
  recentSearches: string[]
  targetCandidates?: CodingTargetCandidate[]
  lastTargetSelection?: CodingTargetSelection
  currentPlan?: CodingChangePlan
  lastChangeReview?: CodingChangeReview
  lastScopedTargetPath?: string
  latestSearchMatchesBySource?: Partial<Record<CodingTargetSourceKind, string[]>>
  pendingIssues: string[]
  lastWorkspaceReview?: CodingWorkspaceReview
  lastCompressedContext?: CodingContextSnapshot
  lastCodingReport?: CodingExecutionReport
  lastValidationSummary?: string
  lastImpactAnalysis?: CodingImpactAnalysis
  impactGraphSnapshot?: CodingImpactGraphSnapshot
  lastTargetHypothesis?: CodingTargetHypothesis
  currentPlanSession?: CodingPlanSession
  lastInvestigation?: CodingInvestigation
  planHistory?: CodingPlanSession[]
  lastChangeDiagnosis?: CodingChangeDiagnosis
  lastDiagnosisCompetition?: CodingDiagnosisCompetition
  lastDiagnosisJudgeInput?: CodingDiagnosisJudgeInput
  lastReplanDraftInput?: CodingReplanDraftInput
  lastCausalTrace?: CodingCausalTrace
  causalTraceLog?: CodingCausalTrace[]
  currentPlanGraph?: CodingPlanGraph
  lastPlanFrontier?: CodingPlanFrontier
  lastPlanDraft?: CodingPlanDraft
  lastTargetDecisionCase?: TargetDecisionCase
  lastTargetJudgement?: TargetJudgement
  lastDiagnosisCase?: DiagnosisCase
  lastDiagnosisJudgement?: DiagnosisJudgement
  validationBaseline?: CodingValidationBaseline
  lastScopedValidationCommand?: CodingScopedValidationCommand
  lastPlannerDecision?: CodingPlannerDecision
  compactionMeta?: CodingCompactionMeta
  roundContext?: CodingRoundContext
}

export interface RunState {
  // --- Desktop context --------------------------------------------------
  /** Most recently observed foreground app name. */
  activeApp?: string
  /** Most recently observed window title. */
  activeWindowTitle?: string
  /** Full foreground context from last probe. */
  foregroundContext?: ForegroundContext
  /** Most recent window observation. */
  lastWindowObservation?: WindowObservation
  /** Last known execution target. */
  executionTarget?: ExecutionTarget
  /** Last known display info. */
  displayInfo?: DisplayInfo
  /** Browser DOM/CDP surface availability for browser rerouting. */
  browserSurfaceAvailability?: BrowserSurfaceAvailability

  // --- VS Code controller context --------------------------------------
  /** Sticky VS Code engineering-controller state. */
  vscode?: VscodeControllerState

  // --- Terminal context -------------------------------------------------
  /** Sticky terminal state (cwd, last exit code, etc.). */
  terminalState?: TerminalState
  /** Full result of the most recent terminal command. */
  lastTerminalResult?: TerminalCommandResult

  // --- Screenshot context -----------------------------------------------
  /** Metadata for the most recent screenshot. */
  lastScreenshot?: LastScreenshotInfo
  /** One-line human summary of the most recent screenshot content. */
  lastScreenshotSummary?: string

  // --- Approval context -------------------------------------------------
  /** Number of pending approval actions. */
  pendingApprovalCount: number
  /** Whether the last approval was rejected. */
  lastApprovalRejected: boolean
  /** Reason for the last rejection (if any). */
  lastRejectionReason?: string
  /** The most recent policy decision. */
  lastPolicyDecision?: PolicyDecision

  // --- PTY context -------------------------------------------------------
  /** Registry of active PTY sessions tracked by the state manager. */
  ptySessions: PtySessionState[]
  /** The session id most recently written to or read from. */
  activePtySessionId?: string

  // --- Terminal lane context ---------------------------------------------
  /** Most recent surface routing decision. */
  recentSurfaceDecision?: SurfaceDecision
  /** Active workflow-step → terminal bindings. */
  workflowStepTerminalBindings: WorkflowStepTerminalBinding[]
  /** Active PTY Open Grant records. */
  ptyApprovalGrants: PtyApprovalGrant[]
  /** PTY audit log (kept in memory for current session). */
  ptyAuditLog: PtyAuditEntry[]

  // --- Task context -----------------------------------------------------
  /** Currently active task (if any). */
  activeTask?: ActiveTask

  // --- Task memory ------------------------------------------------------
  /** High-level task execution state (goal, facts, blockers, next step). */
  taskMemory?: TaskMemory

  // --- Coding core context ----------------------------------------------
  // --- Coding core context ----------------------------------------------
  /** State specific to the AIRI Coding Surface v1. */
  coding?: CodingRunState

  // --- Meta -------------------------------------------------------------
  /** ISO timestamp of the last state update. */
  updatedAt: string
}

// ---------------------------------------------------------------------------
// State Manager
// ---------------------------------------------------------------------------

export class RunStateManager {
  private state: RunState

  constructor() {
    this.state = {
      pendingApprovalCount: 0,
      lastApprovalRejected: false,
      ptySessions: [],
      workflowStepTerminalBindings: [],
      ptyApprovalGrants: [],
      ptyAuditLog: [],
      updatedAt: new Date().toISOString(),
    }
  }

  private readonly codingCompactionThresholds = {
    recentReads: 120,
    recentEdits: 120,
    recentCommandResults: 80,
    recentSearches: 80,
    pendingIssues: 40,
    planHistory: 30,
    causalTraceLog: 30,
  } as const

  private readonly codingCompactionKeep = {
    recentReads: 40,
    recentEdits: 40,
    recentCommandResults: 20,
    recentSearches: 20,
    pendingIssues: 20,
    planHistory: 12,
    causalTraceLog: 24,
  } as const

  private dedupeStrings(items: string[], maxItems: number) {
    return Array.from(new Set(items.filter(Boolean))).slice(0, maxItems)
  }

  private compactCausalTraceLog(log: CodingCausalTrace[], keep: number): CodingCausalTrace[] {
    if (log.length <= keep) {
      return log
    }

    const sorted = [...log].sort((left, right) => {
      const leftTime = Date.parse(left.createdAt || '') || 0
      const rightTime = Date.parse(right.createdAt || '') || 0
      if (leftTime !== rightTime) {
        return leftTime - rightTime
      }

      return left.traceId.localeCompare(right.traceId)
    })

    const keepRecent = Math.max(1, Math.floor(keep / 2))
    const recent = sorted.slice(-keepRecent)
    const seenTraceIds = new Set(recent.map(trace => trace.traceId))

    const latestByRootCause = new Map<string, CodingCausalTrace>()
    for (const trace of sorted) {
      latestByRootCause.set(trace.rootCauseType, trace)
    }

    const merged: CodingCausalTrace[] = [...recent]
    for (const trace of latestByRootCause.values()) {
      if (seenTraceIds.has(trace.traceId)) {
        continue
      }
      merged.push(trace)
      seenTraceIds.add(trace.traceId)
    }

    const compacted = merged
      .sort((left, right) => {
        const leftTime = Date.parse(left.createdAt || '') || 0
        const rightTime = Date.parse(right.createdAt || '') || 0
        if (leftTime !== rightTime) {
          return leftTime - rightTime
        }

        return left.traceId.localeCompare(right.traceId)
      })
      .slice(-keep)

    return compacted
  }

  private compactCodingStateIfNeeded(coding: CodingRunState, trigger: 'update' | 'round_refresh'): CodingRunState {
    let next = coding
    const compactedBuckets: string[] = []
    let droppedItems = 0

    const compactArrayBucket = <T, K extends keyof Pick<CodingRunState, 'recentReads' | 'recentEdits' | 'recentCommandResults' | 'recentSearches' | 'pendingIssues' | 'planHistory'>>(
      key: K,
      threshold: number,
      keep: number,
    ) => {
      const currentValue = next[key] as T[] | undefined
      if (!currentValue || currentValue.length <= threshold) {
        return
      }

      const compacted = currentValue.slice(-keep)
      droppedItems += Math.max(0, currentValue.length - compacted.length)
      compactedBuckets.push(String(key))
      next = { ...next, [key]: compacted }
    }

    compactArrayBucket('recentReads', this.codingCompactionThresholds.recentReads, this.codingCompactionKeep.recentReads)
    compactArrayBucket('recentEdits', this.codingCompactionThresholds.recentEdits, this.codingCompactionKeep.recentEdits)
    compactArrayBucket('recentCommandResults', this.codingCompactionThresholds.recentCommandResults, this.codingCompactionKeep.recentCommandResults)
    compactArrayBucket('recentSearches', this.codingCompactionThresholds.recentSearches, this.codingCompactionKeep.recentSearches)
    compactArrayBucket('pendingIssues', this.codingCompactionThresholds.pendingIssues, this.codingCompactionKeep.pendingIssues)
    compactArrayBucket('planHistory', this.codingCompactionThresholds.planHistory, this.codingCompactionKeep.planHistory)

    if ((next.causalTraceLog?.length || 0) > this.codingCompactionThresholds.causalTraceLog) {
      const current = next.causalTraceLog || []
      const compacted = this.compactCausalTraceLog(current, this.codingCompactionKeep.causalTraceLog)
      droppedItems += Math.max(0, current.length - compacted.length)
      compactedBuckets.push('causalTraceLog')

      const lastCausalTrace = next.lastCausalTrace
      const keepTraceIds = new Set(compacted.map(trace => trace.traceId))
      const nextLog = lastCausalTrace && !keepTraceIds.has(lastCausalTrace.traceId)
        ? [...compacted.slice(1), lastCausalTrace]
        : compacted

      next = {
        ...next,
        causalTraceLog: nextLog,
        lastCausalTrace: lastCausalTrace || nextLog[nextLog.length - 1],
      }
    }

    if (compactedBuckets.length === 0) {
      return next
    }

    const previousCompactionCount = next.compactionMeta?.compactionCount || 0
    return {
      ...next,
      compactionMeta: {
        compactionCount: previousCompactionCount + 1,
        lastCompactedAt: new Date().toISOString(),
        lastTrigger: trigger,
        compactedBuckets,
        droppedItems,
      },
    }
  }

  /** Return a readonly snapshot of the current run state. */
  getState(): Readonly<RunState> {
    return { ...this.state }
  }

  // -- Desktop context updates -------------------------------------------

  updateForegroundContext(ctx: ForegroundContext) {
    this.state.foregroundContext = ctx
    this.state.activeApp = ctx.appName
    this.state.activeWindowTitle = ctx.windowTitle
    this.touch()
  }

  updateWindowObservation(obs: WindowObservation) {
    this.state.lastWindowObservation = obs
    if (obs.frontmostAppName) {
      this.state.activeApp = obs.frontmostAppName
    }
    if (obs.frontmostWindowTitle) {
      this.state.activeWindowTitle = obs.frontmostWindowTitle
    }
    this.touch()
  }

  updateExecutionTarget(target: ExecutionTarget) {
    this.state.executionTarget = target
    this.touch()
  }

  updateDisplayInfo(info: DisplayInfo) {
    this.state.displayInfo = info
    this.touch()
  }

  updateBrowserSurfaceAvailability(availability: BrowserSurfaceAvailability) {
    this.state.browserSurfaceAvailability = availability
    this.touch()
  }

  updateVscodeCli(cli: { cli: string, path: string }) {
    this.state.vscode = {
      ...(this.state.vscode ?? { updatedAt: new Date().toISOString() }),
      codeCli: cli,
      updatedAt: new Date().toISOString(),
    }
    this.touch()
  }

  updateVscodeWorkspace(workspacePath: string) {
    this.state.vscode = {
      ...(this.state.vscode ?? { updatedAt: new Date().toISOString() }),
      workspacePath,
      updatedAt: new Date().toISOString(),
    }
    this.touch()
  }

  updateVscodeCurrentFile(file: { filePath: string, line?: number, column?: number }) {
    this.state.vscode = {
      ...(this.state.vscode ?? { updatedAt: new Date().toISOString() }),
      currentFile: file,
      updatedAt: new Date().toISOString(),
    }
    this.touch()
  }

  updateVscodeTaskResult(task: { command: string, cwd: string, exitCode: number }) {
    this.state.vscode = {
      ...(this.state.vscode ?? { updatedAt: new Date().toISOString() }),
      lastTask: task,
      updatedAt: new Date().toISOString(),
    }
    this.touch()
  }

  updateVscodeProblems(problems: {
    command: string
    cwd: string
    problemCount: number
    problems: VscodeProblem[]
  }) {
    this.state.vscode = {
      ...(this.state.vscode ?? { updatedAt: new Date().toISOString() }),
      lastProblems: problems,
      updatedAt: new Date().toISOString(),
    }
    this.touch()
  }

  // -- Terminal context updates ------------------------------------------

  updateTerminalState(ts: TerminalState) {
    this.state.terminalState = ts
    this.touch()
  }

  updateTerminalResult(result: TerminalCommandResult) {
    this.state.lastTerminalResult = result
    this.state.terminalState = {
      effectiveCwd: result.effectiveCwd,
      lastExitCode: result.exitCode,
      lastCommandSummary: result.command.length > 160
        ? `${result.command.slice(0, 157)}...`
        : result.command,
    }

    // Feature extension: maintain recentCommandResults in coding surface state
    if (!this.state.coding) {
      this.state.coding = {
        workspacePath: '',
        gitSummary: 'Not inspected',
        recentReads: [],
        recentEdits: [],
        recentCommandResults: [],
        recentSearches: [],
        pendingIssues: [],
      }
    }
    const truncatedStderr = result.stderr.length > 1000 ? `${result.stderr.slice(0, 1000)}... (truncated)` : result.stderr
    const truncatedStdout = result.stdout.length > 1000 ? `${result.stdout.slice(0, 1000)}... (truncated)` : result.stdout
    this.state.coding.recentCommandResults.push(
      `Command: ${result.command}\nExit Code: ${result.exitCode}\nStdout: ${truncatedStdout}\nStderr: ${truncatedStderr}`,
    )
    if (this.state.coding.recentCommandResults.length > 5) {
      this.state.coding.recentCommandResults.shift()
    }

    this.state.coding = this.compactCodingStateIfNeeded(this.state.coding, 'update')

    this.touch()
  }

  // -- Screenshot context updates ----------------------------------------

  updateLastScreenshot(info: LastScreenshotInfo, summary?: string) {
    this.state.lastScreenshot = info
    if (summary !== undefined) {
      this.state.lastScreenshotSummary = summary
    }
    this.touch()
  }

  setScreenshotSummary(summary: string) {
    this.state.lastScreenshotSummary = summary
    this.touch()
  }

  // -- Approval context updates ------------------------------------------

  setPendingApprovalCount(count: number) {
    this.state.pendingApprovalCount = count
    this.touch()
  }

  recordApprovalOutcome(rejected: boolean, reason?: string) {
    this.state.lastApprovalRejected = rejected
    this.state.lastRejectionReason = rejected ? reason : undefined
    this.touch()
  }

  updatePolicyDecision(decision: PolicyDecision) {
    this.state.lastPolicyDecision = decision
    this.touch()
  }

  // -- Task context updates ----------------------------------------------

  startTask(task: ActiveTask) {
    this.state.activeTask = task
    this.touch()
  }

  updateTaskPhase(phase: TaskPhase) {
    if (this.state.activeTask) {
      this.state.activeTask.phase = phase
      this.touch()
    }
  }

  advanceTaskStep(step: TaskStep) {
    if (this.state.activeTask) {
      this.state.activeTask.steps.push(step)
      this.state.activeTask.currentStepIndex = this.state.activeTask.steps.length - 1
      this.touch()
    }
  }

  completeCurrentStep(outcome: TaskStep['outcome'], reason?: string) {
    if (!this.state.activeTask)
      return
    const step = this.state.activeTask.steps[this.state.activeTask.currentStepIndex]
    if (step) {
      step.outcome = outcome
      step.outcomeReason = reason
      step.finishedAt = new Date().toISOString()
      if (outcome === 'failure') {
        this.state.activeTask.failureCount += 1
      }
    }
    this.touch()
  }

  finishTask(phase: 'completed' | 'failed' | 'reroute_required') {
    if (this.state.activeTask) {
      this.state.activeTask.phase = phase
      this.state.activeTask.finishedAt = new Date().toISOString()
    }
    this.touch()
  }

  clearTask() {
    this.state.activeTask = undefined
    this.touch()
  }

  // -- Task memory updates ------------------------------------------------

  updateTaskMemory(tm: TaskMemory) {
    this.state.taskMemory = tm
    this.touch()
  }

  // -- Coding context updates --------------------------------------------
  updateCodingState(update: Partial<CodingRunState>) {
    const current: CodingRunState = this.state.coding || {
      workspacePath: '',
      gitSummary: 'Not inspected',
      recentReads: [],
      recentEdits: [],
      recentCommandResults: [],
      recentSearches: [],
      pendingIssues: [],
    }
    this.state.coding = this.compactCodingStateIfNeeded({ ...current, ...update }, 'update')
    this.touch()
  }

  refreshCodingRoundContext() {
    if (!this.state.coding) {
      return
    }

    const coding = this.state.coding
    const activeFile = coding.lastPlannerDecision?.selectedFile
      || coding.lastTargetSelection?.selectedFile
      || coding.currentPlanSession?.steps.find(step => step.status === 'in_progress')?.filePath
      || coding.currentPlan?.steps.find(step => step.status === 'pending')?.filePath

    const activeIntent = coding.currentPlanSession?.changeIntent
      || coding.lastTargetSelection?.changeIntent

    const unresolvedRisks = Array.from(new Set(coding.lastChangeReview?.detectedRisks || [])).slice(0, 8)
    const unresolvedIssues = this.dedupeStrings([
      ...(coding.pendingIssues || []),
      ...((coding.lastChangeReview?.unresolvedIssues || []).map(issue => `review:${issue}`)),
    ], 12)

    const nextStepHint = coding.lastPlannerDecision?.decisionReason
      || coding.lastChangeDiagnosis?.recommendedAction
      || coding.lastChangeReview?.recommendedNextAction
      || coding.lastCodingReport?.nextStep

    const anchors = this.dedupeStrings([
      coding.lastPlannerDecision
        ? `last_decision:${coding.lastPlannerDecision.selectedFile}:${coding.lastPlannerDecision.selectionMode}`
        : '',
      coding.currentPlanSession
        ? `session:${coding.currentPlanSession.status}:amend=${coding.currentPlanSession.amendCount}/${coding.currentPlanSession.maxAmendCount}:backtrack=${coding.currentPlanSession.backtrackCount}/${coding.currentPlanSession.maxBacktrackCount}`
        : '',
      coding.lastChangeDiagnosis
        ? `diagnosis:${coding.lastChangeDiagnosis.rootCauseType}:${coding.lastChangeDiagnosis.nextAction}`
        : '',
      unresolvedRisks.length > 0
        ? `unresolved_risks:${unresolvedRisks.join(',')}`
        : '',
      coding.compactionMeta
        ? `compaction:${coding.compactionMeta.compactionCount}`
        : '',
    ], 8)

    const roundContext: CodingRoundContext = {
      refreshedAt: new Date().toISOString(),
      activeFile,
      activeIntent,
      sessionStatus: coding.currentPlanSession?.status,
      unresolvedRisks,
      unresolvedIssues,
      nextStepHint,
      anchors,
    }

    this.state.coding = this.compactCodingStateIfNeeded({
      ...coding,
      roundContext,
    }, 'round_refresh')

    this.touch()
  }

  clearTaskMemory() {
    this.state.taskMemory = undefined
    this.touch()
  }

  // -- PTY session lifecycle ---------------------------------------------

  /** Register a newly created PTY session in state. */
  registerPtySession(session: Omit<PtySessionState, 'createdAt'>): void {
    // Remove stale entry with same id (shouldn't happen, but defensive)
    this.state.ptySessions = this.state.ptySessions.filter(s => s.id !== session.id)
    this.state.ptySessions.push({
      ...session,
      createdAt: new Date().toISOString(),
    })
    this.state.activePtySessionId = session.id
    this.touch()
  }

  /** Update the alive status of a PTY session (e.g. after process exit). */
  updatePtySessionAlive(sessionId: string, alive: boolean): void {
    const entry = this.state.ptySessions.find(s => s.id === sessionId)
    if (entry) {
      entry.alive = alive
      this.touch()
    }
  }

  /** Record an interaction timestamp on a PTY session. */
  touchPtySession(sessionId: string): void {
    const entry = this.state.ptySessions.find(s => s.id === sessionId)
    if (entry) {
      entry.lastInteractionAt = new Date().toISOString()
      this.state.activePtySessionId = sessionId
      this.touch()
    }
  }

  /** Bind a PTY session to a workflow step by stable stepId. */
  bindPtySessionToStepId(sessionId: string, stepId: string): void {
    const entry = this.state.ptySessions.find(s => s.id === sessionId)
    if (entry) {
      entry.boundStepId = stepId
      this.touch()
    }
  }

  /** Bind a PTY session to a workflow step label (legacy compat). */
  bindPtySessionToStep(sessionId: string, stepLabel: string): void {
    const entry = this.state.ptySessions.find(s => s.id === sessionId)
    if (entry) {
      entry.boundWorkflowStepLabel = stepLabel
      this.touch()
    }
  }

  /** Remove a PTY session from the registry (after destroy). */
  unregisterPtySession(sessionId: string): void {
    this.state.ptySessions = this.state.ptySessions.filter(s => s.id !== sessionId)
    if (this.state.activePtySessionId === sessionId) {
      this.state.activePtySessionId = this.state.ptySessions[0]?.id
    }
    this.touch()
  }

  /** Get the active PTY session id. */
  getActivePtySessionId(): string | undefined {
    return this.state.activePtySessionId
  }

  /** Get all PTY sessions. */
  getPtySessions(): readonly PtySessionState[] {
    return this.state.ptySessions
  }

  // -- Terminal lane: surface decision ------------------------------------

  /** Record the most recent surface routing decision. */
  recordSurfaceDecision(decision: Omit<SurfaceDecision, 'at'>): void {
    this.state.recentSurfaceDecision = {
      ...decision,
      at: new Date().toISOString(),
    }
    this.touch()
  }

  /** Get the most recent surface decision. */
  getRecentSurfaceDecision(): SurfaceDecision | undefined {
    return this.state.recentSurfaceDecision
  }

  // -- Terminal lane: step bindings --------------------------------------

  /** Bind a workflow step to a terminal surface/session. */
  addStepTerminalBinding(binding: WorkflowStepTerminalBinding): void {
    // Replace existing binding for same taskId+stepId
    this.state.workflowStepTerminalBindings = this.state.workflowStepTerminalBindings.filter(
      b => b.taskId !== binding.taskId || b.stepId !== binding.stepId,
    )
    this.state.workflowStepTerminalBindings.push(binding)
    this.touch()
  }

  /** Look up the terminal binding for a task+step. */
  getStepTerminalBinding(taskId: string, stepId: string): WorkflowStepTerminalBinding | undefined {
    return this.state.workflowStepTerminalBindings.find(
      b => b.taskId === taskId && b.stepId === stepId,
    )
  }

  /** Clear all bindings for a given task. */
  clearTaskTerminalBindings(taskId: string): void {
    this.state.workflowStepTerminalBindings = this.state.workflowStepTerminalBindings.filter(
      b => b.taskId !== taskId,
    )
    this.touch()
  }

  // -- Terminal lane: PTY Open Grant -------------------------------------

  /** Grant approval for a PTY session (Open Grant model). */
  grantPtyApproval(approvalSessionId: string, ptySessionId: string): void {
    // Deduplicate
    const existing = this.state.ptyApprovalGrants.find(
      g => g.approvalSessionId === approvalSessionId && g.ptySessionId === ptySessionId,
    )
    if (existing) {
      existing.active = true
      existing.grantedAt = new Date().toISOString()
    }
    else {
      this.state.ptyApprovalGrants.push({
        approvalSessionId,
        ptySessionId,
        grantedAt: new Date().toISOString(),
        active: true,
      })
    }
    this.touch()
  }

  /** Check if a PTY session has an active grant in the given approval session. */
  hasPtyApprovalGrant(approvalSessionId: string, ptySessionId: string): boolean {
    return this.state.ptyApprovalGrants.some(
      g => g.approvalSessionId === approvalSessionId
        && g.ptySessionId === ptySessionId
        && g.active,
    )
  }

  /** Revoke the grant for a PTY session (called on pty_destroy). */
  revokePtyApproval(ptySessionId: string): void {
    for (const g of this.state.ptyApprovalGrants) {
      if (g.ptySessionId === ptySessionId) {
        g.active = false
      }
    }
    this.touch()
  }

  /** Revoke all grants for an approval session (session end). */
  revokeApprovalSession(approvalSessionId: string): void {
    for (const g of this.state.ptyApprovalGrants) {
      if (g.approvalSessionId === approvalSessionId) {
        g.active = false
      }
    }
    this.touch()
  }

  /** Get all active PTY grants. */
  getActivePtyGrants(): readonly PtyApprovalGrant[] {
    return this.state.ptyApprovalGrants.filter(g => g.active)
  }

  // -- Terminal lane: PTY audit ------------------------------------------

  /** Append a PTY audit entry. */
  appendPtyAudit(entry: Omit<PtyAuditEntry, 'at'>): void {
    this.state.ptyAuditLog.push({
      ...entry,
      at: new Date().toISOString(),
    })
    this.touch()
  }

  /** Get all PTY audit entries. */
  getPtyAuditLog(): readonly PtyAuditEntry[] {
    return this.state.ptyAuditLog
  }

  /** Get audit entries for a specific PTY session. */
  getPtyAuditForSession(ptySessionId: string): PtyAuditEntry[] {
    return this.state.ptyAuditLog.filter(e => e.ptySessionId === ptySessionId)
  }

  // -- Helpers -----------------------------------------------------------

  /** Whether the system believes the correct app is in front. */
  isAppInForeground(appName: string): boolean {
    if (!this.state.activeApp)
      return false
    return appNamesMatch(this.state.activeApp, appName)
  }

  /** Whether the last terminal command succeeded (exit 0). */
  lastTerminalSucceeded(): boolean {
    return this.state.lastTerminalResult?.exitCode === 0
  }

  /** Whether the runner is in a healthy state for mutations. */
  isReadyForMutations(): boolean {
    if (!this.state.executionTarget)
      return false
    return !this.state.executionTarget.tainted
  }

  /** Whether there is a task currently in progress. */
  hasActiveTask(): boolean {
    return !!this.state.activeTask
      && this.state.activeTask.phase !== 'completed'
      && this.state.activeTask.phase !== 'failed'
  }

  private touch() {
    this.state.updatedAt = new Date().toISOString()
  }
}
