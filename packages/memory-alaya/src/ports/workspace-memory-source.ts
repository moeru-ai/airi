import type {
  PlannerCheckpoint,
  PlannerRunInput,
  WorkspaceTurn,
} from '../contracts/v1'

export interface WorkspaceListTurnsInput {
  scope: PlannerRunInput['scope']
  window?: PlannerRunInput['window']
  checkpoint?: PlannerCheckpoint
  maxConversations: number
  maxTurns: number
}

export interface WorkspaceListTurnsOutput {
  turns: WorkspaceTurn[]
  nextCursor?: string
  cursorType?: PlannerCheckpoint['cursorType']
}

export interface WorkspaceMemorySource {
  listTurns: (input: WorkspaceListTurnsInput) => Promise<WorkspaceListTurnsOutput>
}
