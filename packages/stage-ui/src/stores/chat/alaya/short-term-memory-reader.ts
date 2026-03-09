import type {
  ShortTermMemoryReader,
  ShortTermMemoryReaderListInput,
  ShortTermMemoryRecord,
} from '@proj-airi/memory-alaya'

import type { AlayaShortTermMemoryRepo } from '../../../database/repos/alaya-short-term-memory.repo'

import { alayaShortTermMemoryRepo } from '../../../database/repos/alaya-short-term-memory.repo'

export interface CreateAlayaShortTermMemoryReaderDeps {
  repo?: AlayaShortTermMemoryRepo
}

function isActiveRecord(record: ShortTermMemoryRecord) {
  return record.retention.status === 'active'
}

export function createAlayaShortTermMemoryReader(
  deps: CreateAlayaShortTermMemoryReaderDeps = {},
): ShortTermMemoryReader {
  const repo = deps.repo ?? alayaShortTermMemoryRepo

  return {
    async listActive(input: ShortTermMemoryReaderListInput) {
      if (!input.scope.workspaceId)
        return []

      const records = await repo.listByWorkspace(input.scope.workspaceId)
      return records.filter(isActiveRecord)
    },
  }
}
