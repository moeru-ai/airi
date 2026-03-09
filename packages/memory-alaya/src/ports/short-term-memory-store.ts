import type {
  PlannerCheckpoint,
  ShortTermMemoryRecord,
} from '../contracts/v1'

export interface ShortTermMemoryStoreUpsertResult {
  inserted: number
  merged: number
  skipped: number
}

export interface ShortTermMemoryStore {
  getCheckpoint(workspaceId: string): Promise<PlannerCheckpoint | undefined>
  saveCheckpoint(checkpoint: PlannerCheckpoint): Promise<void>
  upsert(
    records: ShortTermMemoryRecord[],
    options: { runId: string },
  ): Promise<ShortTermMemoryStoreUpsertResult>
}
