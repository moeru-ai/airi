import type {
  AlayaMemoryCategory,
  AlayaRetentionReason,
  PlannerExtractionFromLlm,
  WorkspaceTurn,
} from '../contracts/v1'

export interface MemoryLlmExtractInput {
  workspaceId: string
  sessionId?: string
  turns: WorkspaceTurn[]
  maxPromptTokens: number
  allowedCategories: AlayaMemoryCategory[]
  allowedRetentionReasons: AlayaRetentionReason[]
}

export interface MemoryLlmProvider {
  extractCandidates(input: MemoryLlmExtractInput): Promise<PlannerExtractionFromLlm | unknown>
}
