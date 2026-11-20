/** Structured state for context compression. It contains no authorization or execution state. */
export interface ContextCompactionContract {
  kind: 'context_compaction'
  status: 'not_compacted' | 'scheduled' | 'running' | 'applied' | 'failed'
  scope?: string
  summarizedRoundIds: string[]
  retainedModelDecisionIds: string[]
  retainedToolCallIds: string[]
  summaryText?: string
  reason?: string
  preserves: {
    modelDecision: true
    authorization: true
    execution: true
    businessVerification: true
  }
}

export function createEmptyContextCompaction(): ContextCompactionContract {
  return {
    kind: 'context_compaction',
    status: 'not_compacted',
    summarizedRoundIds: [],
    retainedModelDecisionIds: [],
    retainedToolCallIds: [],
    preserves: {
      modelDecision: true,
      authorization: true,
      execution: true,
      businessVerification: true,
    },
  }
}
