import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import { useDrizzle } from '../db'
import {
  chatCompletionsHistoryTable,
  chatMessagesTable,
  //   memoryEntityRelationsTable,
  memoryAssociationsTable,
  memoryConsolidatedMemoriesTable,
  memoryEntitiesTable,
  memoryFragmentsTable,
  //   memoryTagsTable,
  //   memoryTagRelationsTable,
  memoryLongTermGoalsTable,
  memoryShortTermIdeasTable,
} from '../db/schema'
import { EmbeddingProviderFactory } from './embedding-providers/factory'
import { LLMProviderFactory } from './llm-providers/factory'
import { SettingsService } from './settings'

// TODO [lucas-oma]: make sure they are all being used correctly
interface ContextBuildingOptions {
  maxWorkingMemoryMessages?: number // Number of recent messages to include
  maxRecentCompletions?: number // Number of recent AI responses to include. (a priori is equal to maxWorkingMemoryMessages)
  maxSemanticMemories?: number // Number of relevant memories to include
  maxEntityRelations?: number // Number of entity relations to include
  maxAssociatedMemories?: number // Number of associated memories to include
  maxTaggedMemories?: number // Number of memories per matching tag
  maxRelevantGoals?: number // Number of relevant goals to include
  includeConsolidatedMemories?: boolean // Whether to include consolidated memories
  includeShortTermIdeas?: boolean // Whether to include short-term ideas
}

const DEFAULT_OPTIONS: ContextBuildingOptions = {
  maxWorkingMemoryMessages: 10,
  maxRecentCompletions: 10,
  maxSemanticMemories: 10,
  maxEntityRelations: 10,
  maxAssociatedMemories: 10,
  maxTaggedMemories: 5,
  maxRelevantGoals: 5,
  includeConsolidatedMemories: true,
  includeShortTermIdeas: true,
}

export interface BuiltContext {
  workingMemory: {
    recentMessages: Array<{
      content: string
      created_at: number
    }>
    recentCompletions: Array<{
      response: string
      task: string
      created_at: number
    }>
  }
  semanticMemory: {
    relevantFragments: Array<{
      id: string // needed for finding associations
      content: string
      memory_type: string
      category: string
      importance: number
      emotional_impact: number
      created_at: number
    }>
    consolidatedMemories?: Array<{
      content: string
      summary_type: string
      created_at: number
    }>
    associatedMemories?: Array<{
      content: string
      association_type: string
      strength: number
      created_at: number
    }>
  }
  structuredKnowledge: {
    entities: Array<{
      name: string
      entity_type: string
      description: string | null
      metadata: Record<string, any>
    }>
    // relations: Array<{
    //   entity_id: string
    //   memory_id: string
    //   importance: number
    //   relationship_type: string
    //   confidence: number
    // }>
    // tags: Array<{
    //   name: string
    //   description: string | null
    //   taggedMemories: Array<{
    //     content: string
    //     created_at: number
    //   }>
    // }>
  }
  goalContext: {
    longTermGoals: Array<{
      title: string
      description: string
      priority: number
      progress: number
      status: string
    }>
    shortTermIdeas?: Array<{
      content: string
      excitement: number
      status: string
    }>
  }
}

export class ContextBuilder {
  private db = useDrizzle()
  private embeddingFactory: EmbeddingProviderFactory
  private llmFactory: LLMProviderFactory
  private settings = SettingsService.getInstance()

  constructor() {
    this.embeddingFactory = EmbeddingProviderFactory.getInstance()
    this.llmFactory = LLMProviderFactory.getInstance()
  }

  private formatContextToNaturalLanguage(context: BuiltContext): string {
    const parts: string[] = [
      'IMPORTANT, use the following context to answer the user\'s query. This corresponds to some of your memories regarding previous conversations and interactions with the user:',
    ]

    // Recent conversation context
    if (context.workingMemory.recentMessages.length > 0) {
      parts.push('Recent messages sent by the user:')
      const messages = context.workingMemory.recentMessages
        .map(m => `- ${new Date(m.created_at).toLocaleString()}: ${m.content}`)
        .join('\n')
      parts.push(`${messages}\n`)
    }

    // Recent AI responses
    if (context.workingMemory.recentCompletions.length > 0) {
      parts.push('Recent (LLM) responses:')
      const responses = context.workingMemory.recentCompletions
        .map(c => `- ${new Date(c.created_at).toLocaleString()}: ${c.response} (Task: ${c.task})`)
        .join('\n')
      parts.push(`${responses}\n`)
    }

    // Relevant memories
    if (context.semanticMemory.relevantFragments.length > 0) {
      parts.push('Relevant memories YOU (LLM) recall:')
      const memories = context.semanticMemory.relevantFragments
        .map((m) => {
          const date = new Date(m.created_at).toLocaleString()
          return `- ${date} (${m.memory_type}, importance: ${m.importance}): ${m.content}`
        })
        .join('\n')
      parts.push(`${memories}\n`)
    }

    // Associated memories
    if (context.semanticMemory.associatedMemories && context.semanticMemory.associatedMemories.length > 0) {
      parts.push('Related memories YOU (LLM) have associated with the above:')
      const associated = context.semanticMemory.associatedMemories
        .map(m => `- ${new Date(m.created_at).toLocaleString()} (${m.association_type}, strength: ${m.strength}): ${m.content}`)
        .join('\n')
      parts.push(`${associated}\n`)
    }

    // Consolidated memories
    if (context.semanticMemory.consolidatedMemories && context.semanticMemory.consolidatedMemories.length > 0) {
      parts.push('YOUR (LLM) consolidated understanding:')
      const consolidated = context.semanticMemory.consolidatedMemories
        .map(m => `- ${new Date(m.created_at).toLocaleString()} (${m.summary_type}): ${m.content}`)
        .join('\n')
      parts.push(`${consolidated}\n`)
    }

    // Known entities
    if (context.structuredKnowledge.entities.length > 0) {
      parts.push('Entities YOU (LLM) recall being mentioned:')
      const entities = context.structuredKnowledge.entities
        .map(e => `- ${e.name} (${e.entity_type})${e.description ? `: ${e.description}` : ''}`)
        .join('\n')
      parts.push(`${entities}\n`)
    }

    // Long-term goals
    if (context.goalContext.longTermGoals.length > 0) {
      parts.push('Relevant long-term goals YOU (LLM) are aware of:')
      const goals = context.goalContext.longTermGoals
        .map(g => `- ${g.title} (Priority: ${g.priority}, Progress: ${g.progress}%): ${g.description}`)
        .join('\n')
      parts.push(`${goals}\n`)
    }

    // Short-term ideas
    if (context.goalContext.shortTermIdeas && context.goalContext.shortTermIdeas.length > 0) {
      parts.push('Related short-term ideas YOU (LLM) have considered:')
      const ideas = context.goalContext.shortTermIdeas
        .map(i => `- (Excitement: ${i.excitement}): ${i.content}`)
        .join('\n')
      parts.push(`${ideas}\n`)
    }

    return parts.join('\n')
  }

  /**
   * Main method to build context for a user query
   */
  async buildContext(
    query: string,
    options: ContextBuildingOptions = {},
  ): Promise<string> {
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options }

    // Generate embeddings for the query
    const queryEmbeddings = await this.embeddingFactory.generateEmbedding(query)

    // Build context in parallel for better performance
    const [
      workingMemory,
      semanticMemory,
      structuredKnowledge,
      goalContext,
    ] = await Promise.all([
      this.buildWorkingMemoryContext(mergedOptions), // messages and completions
      this.buildSemanticMemoryContext(queryEmbeddings, mergedOptions), // RAG w/ memories (relevantFragments, consolidatedMemories,associatedMemories)
      this.buildStructuredKnowledgeContext(query), // entities and tags
      this.buildGoalContext(queryEmbeddings, mergedOptions), // goals and ideas (RAG)
    ])

    const context = {
      workingMemory,
      semanticMemory,
      structuredKnowledge,
      goalContext,
    }

    // Format context in natural language
    return this.formatContextToNaturalLanguage(context)
  }

  /**
   * Build working memory context from recent messages and completions
   */
  private async buildWorkingMemoryContext(options: ContextBuildingOptions) {
    const [recentMessages, recentCompletions] = await Promise.all([
      // Get recent messages
      this.db
        .select({
          content: chatMessagesTable.content,
          created_at: chatMessagesTable.created_at,
        })
        .from(chatMessagesTable)
        .orderBy(desc(chatMessagesTable.created_at))
        .limit(options.maxWorkingMemoryMessages!),

      // Get recent AI completions
      this.db
        .select({
          response: chatCompletionsHistoryTable.response,
          task: chatCompletionsHistoryTable.task,
          created_at: chatCompletionsHistoryTable.created_at,
        })
        .from(chatCompletionsHistoryTable)
        .orderBy(desc(chatCompletionsHistoryTable.created_at))
        .limit(options.maxRecentCompletions!),
    ])

    return {
      recentMessages,
      recentCompletions,
    }
  }

  /**
   * Build semantic memory context using vector similarity search and associations <--> RAG
   */
  private async buildSemanticMemoryContext(
    queryEmbeddings: any, // the expected format is { content_vector_1536: number[] | null, content_vector_1024: number[] | null, content_vector_768: number[] | null }
    options: ContextBuildingOptions,
  ) {
    const settings = await this.settings.getSettings()
    const vectorDimension = settings.mem_embedding_dimensions
    const vectorColumn = `content_vector_${vectorDimension}`
    const queryVector = queryEmbeddings[`content_vector_${vectorDimension}` as keyof typeof queryEmbeddings]

    if (!queryVector) {
      throw new Error(`No vector found for dimension ${vectorDimension}`)
    }

    // Search fragments
    const relevantFragments = await this.db
      .select({
        id: memoryFragmentsTable.id,
        content: memoryFragmentsTable.content,
        memory_type: memoryFragmentsTable.memory_type,
        category: memoryFragmentsTable.category,
        importance: memoryFragmentsTable.importance,
        emotional_impact: memoryFragmentsTable.emotional_impact,
        created_at: memoryFragmentsTable.created_at,
        similarity: sql<number>`1 - (${memoryFragmentsTable[vectorColumn as keyof typeof memoryFragmentsTable]} <=> ${JSON.stringify(queryVector)})`.as('similarity'),
      })
      .from(memoryFragmentsTable)
      .where(
        and(
          sql`${memoryFragmentsTable[vectorColumn as keyof typeof memoryFragmentsTable]} is not null`,
          isNull(memoryFragmentsTable.deleted_at),
        ),
      )
      .orderBy(desc(sql`similarity`))
      .limit(options.maxSemanticMemories!)

    // Search consolidated memories if enabled
    let consolidatedMemories
    if (options.includeConsolidatedMemories) {
      consolidatedMemories = await this.db
        .select({
          content: memoryConsolidatedMemoriesTable.content,
          summary_type: memoryConsolidatedMemoriesTable.summary_type,
          created_at: memoryConsolidatedMemoriesTable.created_at,
          similarity: sql<number>`1 - (${memoryConsolidatedMemoriesTable[vectorColumn as keyof typeof memoryConsolidatedMemoriesTable]} <=> ${JSON.stringify(queryVector)})`.as('similarity'),
        })
        .from(memoryConsolidatedMemoriesTable)
        .where(sql`${memoryConsolidatedMemoriesTable[vectorColumn as keyof typeof memoryConsolidatedMemoriesTable]} is not null`)
        .orderBy(desc(sql`similarity`))
        .limit(Math.floor(options.maxSemanticMemories! / 2))
    }

    // Find associated memories
    let associatedMemories: Array<{
      content: string
      association_type: string
      strength: number
      created_at: number
    }> = []
    if (options.maxAssociatedMemories! > 0 && relevantFragments.length > 0) {
      const fragmentIds = relevantFragments.map(f => f.id)
      associatedMemories = await this.db
        .select({
          content: memoryFragmentsTable.content,
          association_type: memoryAssociationsTable.association_type,
          strength: memoryAssociationsTable.strength,
          created_at: memoryFragmentsTable.created_at,
        })
        .from(memoryAssociationsTable)
        .innerJoin(
          memoryFragmentsTable,
          eq(memoryAssociationsTable.target_memory_id, memoryFragmentsTable.id),
        )
        .where(inArray(memoryAssociationsTable.source_memory_id, fragmentIds))
        .orderBy(desc(memoryAssociationsTable.strength))
        .limit(options.maxAssociatedMemories!)
    }

    return {
      relevantFragments,
      consolidatedMemories,
      associatedMemories,
    }
  }

  /**
   * Build structured knowledge context by extracting and looking up entities and tags
   */
  private async buildStructuredKnowledgeContext(
    query: string,
    // options: ContextBuildingOptions // TODO [lucas-oma]: add this back in when we improve the entity extraction
  ) {
    // Use LLM to extract entities and keywords from query
    const llmProvider = await this.llmFactory.getProvider()

    // Extract entities and keywords using processBatch
    const response = await llmProvider.processBatch({
      messageIds: [],
      messages: [{
        content: query,
        role: 'user',
      }],
    })

    // Get entities
    const extractedEntities = response.entities?.map(e => e.name) || []

    // TODO [lucas-oma]: filter entities based in relevance to the query

    // Look up entities
    const entities = await this.db
      .select({
        name: memoryEntitiesTable.name,
        entity_type: memoryEntitiesTable.entity_type,
        description: memoryEntitiesTable.description,
        metadata: memoryEntitiesTable.metadata as Record<string, any>,
      })
      .from(memoryEntitiesTable)
      .where(inArray(memoryEntitiesTable.name, extractedEntities))

    return {
      entities,
    }
  }

  /**
   * Build goal-oriented context <--> RAG
   */
  private async buildGoalContext(
    queryEmbeddings: any,
    options: ContextBuildingOptions,
  ) {
    const settings = await this.settings.getSettings()
    const vectorDimension = settings.mem_embedding_dimensions
    const vectorColumn = `content_vector_${vectorDimension}`
    const queryVector = queryEmbeddings[`content_vector_${vectorDimension}` as keyof typeof queryEmbeddings]

    if (!queryVector) {
      throw new Error(`No vector found for dimension ${vectorDimension}`)
    }

    // Find relevant long-term goals
    const longTermGoals = await this.db
      .select({
        title: memoryLongTermGoalsTable.title,
        description: memoryLongTermGoalsTable.description,
        priority: memoryLongTermGoalsTable.priority,
        progress: memoryLongTermGoalsTable.progress,
        status: memoryLongTermGoalsTable.status,
      })
      .from(memoryLongTermGoalsTable)
      .where(isNull(memoryLongTermGoalsTable.deleted_at))
      .orderBy(desc(memoryLongTermGoalsTable.priority))
      .limit(options.maxRelevantGoals!)

    // Find relevant short-term ideas if enabled
    let shortTermIdeas
    if (options.includeShortTermIdeas) {
      shortTermIdeas = await this.db
        .select({
          content: memoryShortTermIdeasTable.content,
          excitement: memoryShortTermIdeasTable.excitement,
          status: memoryShortTermIdeasTable.status,
        })
        .from(memoryShortTermIdeasTable)
        .where(
          and(
            sql`${memoryShortTermIdeasTable[vectorColumn as keyof typeof memoryShortTermIdeasTable]} is not null`,
            isNull(memoryShortTermIdeasTable.deleted_at),
          ),
        )
        .orderBy(desc(memoryShortTermIdeasTable.excitement))
        .limit(options.maxRelevantGoals!)
    }

    return {
      longTermGoals,
      shortTermIdeas,
    }
  }
}
