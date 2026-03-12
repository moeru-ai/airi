// ---------------------------------------------------------------------------
// Task Memory — current task execution state for computer-use-mcp.
//
// Not a long-term memory system. Only tracks:
// "what are we doing, what's confirmed, what's blocking, what's next."
// ---------------------------------------------------------------------------

export type TaskMemoryStatus = 'active' | 'blocked' | 'done'

export interface TaskMemoryArtifact {
  label: string
  value: string
  kind: 'file' | 'url' | 'tool' | 'note'
}

/**
 * Primary task execution state attached to a computer-use session.
 */
export interface TaskMemory {
  // --- Primary fields ---
  status: TaskMemoryStatus
  goal: string | null
  currentStep: string | null
  confirmedFacts: string[]
  artifacts: TaskMemoryArtifact[]
  blockers: string[]
  nextStep: string | null
  updatedAt: number
  /** Identifies which tool invocation / turn produced this snapshot. */
  sourceTurnId: string

  // --- Secondary fields (all optional) ---
  plan?: string[]
  workingAssumptions?: string[]
  recentFailureReason?: string | null
  completionCriteria?: string[]
}

/**
 * Raw extraction output — may have partial fields.
 * Used as input to the validated merge function.
 */
export interface TaskMemoryExtraction {
  status?: TaskMemoryStatus
  goal?: string | null
  currentStep?: string | null
  confirmedFacts?: string[]
  artifacts?: TaskMemoryArtifact[]
  blockers?: string[]
  nextStep?: string | null
  plan?: string[]
  workingAssumptions?: string[]
  recentFailureReason?: string | null
  completionCriteria?: string[]
  /** Signals a clearly new task, triggering soft reset. */
  newTask?: boolean
}

export interface TaskMemoryUpdateSource {
  /** Stable identifier of the completed turn that produced this update. */
  sourceTurnId: string
  /** Monotonic sequence of the completed turn within the session. */
  sourceTurnIndex: number
}

/** List length limits — v1, hard-coded. */
export const TASK_MEMORY_LIMITS = {
  confirmedFacts: 10,
  artifacts: 8,
  blockers: 5,
  plan: 6,
  workingAssumptions: 6,
  completionCriteria: 6,
} as const
