// ---------------------------------------------------------------------------
// Task Memory — current task execution state for computer-use-mcp.
//
// Not a long-term memory system. Only tracks:
// "what are we doing, what's confirmed, what's blocking, what's next."
// ---------------------------------------------------------------------------

/**
 * Primary task execution state attached to a computer-use session.
 */
export interface TaskMemory {
  artifacts: TaskMemoryArtifact[]
  blockers: string[]
  completionCriteria?: string[]
  confirmedFacts: string[]
  currentStep: null | string
  goal: null | string
  nextStep: null | string
  // --- Secondary fields (all optional) ---
  plan?: string[]
  recentFailureReason?: null | string

  /** Identifies which tool invocation / turn produced this snapshot. */
  sourceTurnId: string
  // --- Primary fields ---
  status: TaskMemoryStatus
  updatedAt: number
  workingAssumptions?: string[]
}

export interface TaskMemoryArtifact {
  kind: 'file' | 'note' | 'tool' | 'url'
  label: string
  value: string
}

/**
 * Raw extraction output — may have partial fields.
 * Used as input to the validated merge function.
 */
export interface TaskMemoryExtraction {
  artifacts?: TaskMemoryArtifact[]
  blockers?: string[]
  completionCriteria?: string[]
  confirmedFacts?: string[]
  currentStep?: null | string
  goal?: null | string
  /** Signals a clearly new task, triggering soft reset. */
  newTask?: boolean
  nextStep?: null | string
  plan?: string[]
  recentFailureReason?: null | string
  status?: TaskMemoryStatus
  workingAssumptions?: string[]
}

export type TaskMemoryStatus = 'active' | 'blocked' | 'done'

export interface TaskMemoryUpdateSource {
  /** Stable identifier of the completed turn that produced this update. */
  sourceTurnId: string
  /** Monotonic sequence of the completed turn within the session. */
  sourceTurnIndex: number
}

/** List length limits — v1, hard-coded. */
export const TASK_MEMORY_LIMITS = {
  artifacts: 8,
  blockers: 5,
  completionCriteria: 6,
  confirmedFacts: 10,
  plan: 6,
  workingAssumptions: 6,
} as const
