import type {
  QueryEngineInput,
  QueryEngineOutput,
  ShortTermMemoryRecord,
} from '../contracts/v1'
import type { ShortTermMemoryReader } from '../ports/short-term-memory-reader'

export interface RecallShortTermCandidatesDeps {
  shortTermReader: ShortTermMemoryReader
}

function normalizeTimestamp(input: unknown) {
  return typeof input === 'number' && Number.isFinite(input) ? input : 0
}

function isActiveRecord(record: ShortTermMemoryRecord, scope: QueryEngineInput['scope']) {
  if (record.workspaceId !== scope.workspaceId)
    return false
  if (record.retention.status !== 'active')
    return false
  return true
}

export async function recallShortTermCandidates(
  input: QueryEngineInput,
  deps: RecallShortTermCandidatesDeps,
  errors: QueryEngineOutput['errors'],
): Promise<ShortTermMemoryRecord[]> {
  try {
    const records = await deps.shortTermReader.listActive({
      scope: input.scope,
      now: input.now,
    })

    const deduped = new Map<string, ShortTermMemoryRecord>()
    for (const record of records) {
      if (!isActiveRecord(record, input.scope))
        continue
      deduped.set(record.memoryId, record)
    }

    return [...deduped.values()].sort((left, right) => {
      const leftTs = normalizeTimestamp(left.updatedAt || left.createdAt)
      const rightTs = normalizeTimestamp(right.updatedAt || right.createdAt)
      if (leftTs === rightTs)
        return left.memoryId.localeCompare(right.memoryId)
      return rightTs - leftTs
    })
  }
  catch (error) {
    errors.push({
      code: 'ALAYA_E_STORE_READ_FAILED',
      message: error instanceof Error ? error.message : 'Failed to read short-term records',
      retriable: true,
    })
    return []
  }
}
