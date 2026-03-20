export type ShortTermMemorySource = 'automatic' | 'rebuilt'

export interface ShortTermMemoryBlock {
  id: string
  userId: string
  characterId: string
  characterName: string
  date: string
  source: ShortTermMemorySource
  summary: string
  estimatedTokens: number
  messageCount: number
  sessionCount: number
  createdAt: number
  updatedAt: number
}
