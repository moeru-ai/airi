export interface MemoryServiceConfig {
  url: string
  apiKey: string
}

export interface StructuredMemoryFragment {
  id: string
  content: string
  memory_type: string
  category: string
  importance: number
  emotional_impact: number
  created_at: number
}

export interface StructuredMemoryContext {
  workingMemory: {
    recentMessages: Array<{ content: string, created_at: number }>
    recentCompletions: Array<{ response: string, task: string, created_at: number }>
  }
  semanticMemory: {
    shortTerm: StructuredMemoryFragment[]
    longTerm: StructuredMemoryFragment[]
    consolidatedMemories?: Array<{ content: string, summary_type: string, created_at: number }>
    associatedMemories?: Array<{ content: string, association_type: string, strength: number, created_at: number }>
  }
  structuredKnowledge: {
    entities: Array<{ name: string, entity_type: string, description: string | null, metadata: Record<string, unknown> }>
  }
  goalContext: {
    longTermGoals: Array<{ title: string, description: string, priority: number, progress: number, status: string }>
    shortTermIdeas?: Array<{ content: string, excitement: number, status: string }>
  }
}

export interface ConversationHistoryEntry {
  id: string
  content: string
  type: 'user' | 'assistant'
  created_at: number
  platform?: string
  task?: string
}
