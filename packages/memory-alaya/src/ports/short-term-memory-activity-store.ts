export interface ShortTermMemoryMarkAccessedInput {
  workspaceId: string
  memoryIds: string[]
  accessedAt: number
}

export interface ShortTermMemoryActivityStore {
  markAccessed(input: ShortTermMemoryMarkAccessedInput): Promise<number>
}
