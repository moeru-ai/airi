import type {
  QueryEngineInput,
  ShortTermMemoryRecord,
} from '../contracts/v1'

export interface ShortTermMemoryReaderListInput {
  scope: QueryEngineInput['scope']
  now: number
}

export interface ShortTermMemoryReader {
  listActive: (input: ShortTermMemoryReaderListInput) => Promise<ShortTermMemoryRecord[]>
}
