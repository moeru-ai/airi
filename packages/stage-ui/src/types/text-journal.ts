export type TextJournalEntrySource = 'tool' | 'chat' | 'proactivity' | 'user' | 'seed'

export interface TextJournalEntry {
  id: string
  userId: string
  characterId: string
  characterName: string
  title: string
  content: string
  source: TextJournalEntrySource
  createdAt: number
  updatedAt: number
}
