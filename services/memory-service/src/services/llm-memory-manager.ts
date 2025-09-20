/**
 * LLM Memory Manager
 *
 * This service handles:
 * - Processing batches of messages with LLM
 * - Creating memory fragments, goals, ideas, etc.
 * - Creating episodes, entities, and consolidated memories
 * - Updating memory tables with structured data
 */

// TODO [lucas-oma]: remove console.log comments

import type { ProcessingBatch } from './background-trigger.js'

import { inArray, sql } from 'drizzle-orm'

import { useDrizzle } from '../db/index.js'
import {
  memoryConsolidatedMemoriesTable,
  memoryEntitiesTable,
  memoryEntityRelationsTable,
  memoryEpisodesTable,
  memoryFragmentsTable,
  memoryLongTermGoalsTable,
  memoryShortTermIdeasTable,
  memoryTagRelationsTable,
  memoryTagsTable,
} from '../db/schema.js'
import { EmbeddingProviderFactory } from './embedding-providers/factory.js'
import { LLMProviderFactory } from './llm-providers/factory.js'

// NOTE: This interface defines the structured JSON output we expect from the LLM.
export interface StructuredLLMResponse {
  memoryFragments: {
    content: string
    memoryType: 'working' | 'short_term' | 'long_term' | 'muscle'
    category: string
    importance: number
    emotionalImpact: number
    tags: string[]
  }[]
  goals: {
    title: string
    description: string
    priority: number
    deadline?: number
    category: string
  }[]
  ideas: {
    content: string
    sourceType: 'conversation' | 'reflection' | 'dream'
    excitement: number
    status: 'new' | 'developing' | 'implemented' | 'abandoned'
  }[]
  // NEW: Episode detection and grouping
  episodes: {
    episodeType: 'chat_session' | 'dream' | 'meditation' | 'conversation' | 'event' | 'reflection'
    title: string
    startTime?: number
    endTime?: number
    metadata?: Record<string, any>
  }[]
  // NEW: Entity extraction and knowledge
  entities: {
    name: string
    entityType: 'person' | 'place' | 'organization' | 'concept' | 'thing'
    description?: string
    metadata?: Record<string, any>
  }[]
  // NEW: Entity-memory relationships
  entityRelations: {
    entityName: string
    memoryContent: string // Reference to memory fragment content
    importance: number // 1-10 scale
    relationshipType: 'mentioned' | 'acted' | 'experienced' | 'created' | 'visited' | 'discussed'
    confidence: number // 1-10 scale
  }[]
  // NEW: Memory consolidation opportunities
  consolidatedMemories: {
    content: string
    summaryType: 'summary' | 'insight' | 'lesson' | 'narrative' | 'pattern'
    sourceFragmentContents: string[] // Array of memory fragment contents to link
    metadata?: Record<string, any>
  }[]
  // The LLM can also infer and return associations between new and existing memories.
  // TODO: This is a placeholder for that advanced logic.
  // associations: { sourceId: string; targetId: string; associationType: string }[]
}

export class LLMMemoryManager {
  private db = useDrizzle()
  private llmProviderFactory = LLMProviderFactory.getInstance()
  private embeddingFactory = EmbeddingProviderFactory.getInstance()

  private async generateEmbeddings(content: string): Promise<{
    content_vector_1536: number[] | null
    content_vector_1024: number[] | null
    content_vector_768: number[] | null
  }> {
    return await this.embeddingFactory.generateEmbedding(content)
  }

  /**
   * Processes an entire batch of messages with a single, structured LLM call.
   */
  async processBatch(batch: ProcessingBatch): Promise<void> {
    // Skip processing if batch is empty
    if (batch.messages.length === 0) {
      return
    }

    try {
      // Get LLM provider
      const llmProvider = await this.llmProviderFactory.getProvider()

      // Process batch
      const response = await llmProvider.processBatch({
        messageIds: batch.messageIds,
        messages: batch.messages,
      })

      // Store the structured data
      await this.updateMemoryTables(response)

      // Mark messages as processed
      // await this.messageIngestion.markMessagesAsProcessed(batch.messageIds) // This line was not in the new_code, so it's removed.
    }
    catch (error) {
      console.error('❌ An error occurred during batch processing:', error)
      throw error // Re-throw to allow the background trigger to handle the failure.
    }
  }

  /**
   * Updates all memory tables in a single, efficient transaction.
   */
  private async updateMemoryTables(structuredData: StructuredLLMResponse): Promise<void> {
    // console.log(`🔍 Processing ${structuredData.memoryFragments.length} memory fragments`)
    // console.log(`🏷️ Processing ${structuredData.goals.length} goals`)
    // console.log(`💡 Processing ${structuredData.ideas.length} ideas`)
    // console.log(`📅 Processing ${structuredData.episodes?.length || 0} episodes`)
    // console.log(`👥 Processing ${structuredData.entities?.length || 0} entities`)
    // console.log(`🔗 Processing ${structuredData.entityRelations?.length || 0} entity relations`)
    // console.log(`📚 Processing ${structuredData.consolidatedMemories?.length || 0} consolidated memories`)

    const memoryFragments = structuredData.memoryFragments.map(f => ({
      ...f,
      emotional_impact: f.emotionalImpact, // Drizzle expects snake_case
      memory_type: f.memoryType,
      access_count: 1,
      created_at: Date.now(),
      last_accessed: Date.now(),
      metadata: {},
      // Link to episode if one was detected for this batch
      episode_id: undefined as string | undefined, // Will be set after episode creation
    }))

    const tagsToCreate = new Set(structuredData.memoryFragments.flatMap(f => f.tags))

    // Get existing tags first to avoid duplicates
    const existingTags = await this.db
      .select({ id: memoryTagsTable.id, name: memoryTagsTable.name })
      .from(memoryTagsTable)
      .where(inArray(memoryTagsTable.name, Array.from(tagsToCreate)))

    const existingTagMap = new Map(existingTags.map(tag => [tag.name, tag.id]))

    // Only create tags that don't already exist
    const newTagNames = Array.from(tagsToCreate).filter(name => !existingTagMap.has(name))
    const newTags = newTagNames.map(name => ({
      name,
      description: `Auto-generated tag for ${name}`,
      created_at: Date.now(),
    }))

    // Defer memory fragment insertion to the transaction below to avoid double insertions

    // Insert only new tags and get their IDs (only if we have tags)
    let createdTags: typeof existingTags = []
    if (newTags.length > 0) {
      createdTags = await this.db.insert(memoryTagsTable).values(newTags).returning()
    }

    // Combine existing and new tags into a single map
    const allTagMap = new Map<string, string>(existingTagMap)
    for (const tag of createdTags) {
      allTagMap.set(tag.name, tag.id)
    }

    // Tag relations will be created inside the transaction after fragment insertion
    // to ensure we have the fragment IDs aligned with the original order.

    // Prepare goals and ideas for insertion
    const goals = structuredData.goals.map(g => ({
      title: g.title,
      description: g.description,
      priority: g.priority,
      deadline: g.deadline,
      category: g.category,
      created_at: Date.now(),
      updated_at: Date.now(),
    }))

    const ideas = structuredData.ideas.map(i => ({
      content: i.content,
      source_type: i.sourceType,
      excitement: i.excitement,
      status: i.status,
      created_at: Date.now(),
      updated_at: Date.now(),
    }))

    // Prepare episodes for insertion
    const episodes = (structuredData.episodes || []).map(e => ({
      episode_type: e.episodeType,
      title: e.title,
      start_time: e.startTime || Date.now(),
      end_time: e.endTime,
      is_processed: false,
      metadata: e.metadata || {},
    }))

    // Prepare entities for insertion
    const entities = (structuredData.entities || []).map(e => ({
      name: e.name,
      entity_type: e.entityType,
      description: e.description,
      metadata: e.metadata || {},
    }))

    // Prepare consolidated memories for insertion
    const consolidatedMemories = (structuredData.consolidatedMemories || []).map(c => ({
      content: c.content,
      summary_type: c.summaryType,
      source_fragment_ids: '[]' as string, // Will be populated after fragments are created
      source_episode_ids: '[]' as string, // Will be populated after episodes are created
      metadata: c.metadata || {},
      created_at: Date.now(),
      last_accessed: Date.now(),
      // Note: content_vector fields will be populated by embedding service
    }))

    // console.log(`💾 Starting database transaction...`)
    await this.db.transaction(async (tx) => {
      // Create episodes first (if any)
      let createdEpisodeId: string | undefined
      if (episodes.length > 0) {
        // console.log(`📅 Inserting ${episodes.length} episodes...`)
        const createdEpisodes = await tx.insert(memoryEpisodesTable).values(episodes).returning({ id: memoryEpisodesTable.id })
        createdEpisodeId = createdEpisodes[0]?.id
        // console.log(`✅ Episodes inserted`)
      }

      // Create entities (if any)
      const createdEntities: Array<{ id: string, name: string }> = []
      if (entities.length > 0) {
        // console.log(`👥 Inserting ${entities.length} entities...`)
        for (const entity of entities) {
          const [result] = await tx
            .insert(memoryEntitiesTable)
            .values(entity)
            .onConflictDoUpdate({
              target: memoryEntitiesTable.name,
              set: {
                description: sql`CASE 
                  WHEN length(EXCLUDED.description) > length(${memoryEntitiesTable.description}) 
                  THEN EXCLUDED.description 
                  ELSE ${memoryEntitiesTable.description}
                END`,
                metadata: sql`${memoryEntitiesTable.metadata} || EXCLUDED.metadata`,
              },
            })
            .returning({ id: memoryEntitiesTable.id, name: memoryEntitiesTable.name })
          createdEntities.push(result)
        }
        // console.log(`✅ Entities inserted/updated`)
      }

      // Create fragments in bulk and then tag relations for the created fragments
      if (memoryFragments.length > 0) {
        // Generate embeddings for all fragments
        const fragmentEmbeddings = await Promise.all(
          memoryFragments.map(f => this.generateEmbeddings(f.content)),
        )

        // Add embeddings to fragments
        memoryFragments.forEach((f, i) => {
          Object.assign(f, fragmentEmbeddings[i])
        })

        // Link fragments to episode if one was created
        if (createdEpisodeId) {
          memoryFragments.forEach((f) => {
            f.episode_id = createdEpisodeId
          })
        }

        // console.log(`📝 Inserting ${memoryFragments.length} memory fragments...`)
        const createdFragments = await tx.insert(memoryFragmentsTable).values(memoryFragments).returning({ id: memoryFragmentsTable.id })
        // console.log(`✅ Memory fragments inserted`)

        // Build tag relations using returned fragment IDs in order
        const tagRelations: Array<{ memory_id: string, tag_id: string, created_at: number }> = []
        for (let i = 0; i < structuredData.memoryFragments.length; i++) {
          const f = structuredData.memoryFragments[i]
          const fragmentId = createdFragments[i]?.id
          if (!fragmentId)
            continue
          for (const tagName of f.tags) {
            const tagId = allTagMap.get(tagName)
            if (tagId) {
              tagRelations.push({ memory_id: fragmentId, tag_id: tagId, created_at: Date.now() })
            }
          }
        }

        if (tagRelations.length > 0) {
          // console.log(`🔗 Inserting ${tagRelations.length} tag relations...`)
          await tx.insert(memoryTagRelationsTable).values(tagRelations)
          // console.log(`✅ Tag relations inserted`)
        }

        // Build entity relations if we have entities and entity relations data
        if (createdEntities.length > 0 && structuredData.entityRelations) {
          const entityMap = new Map(createdEntities.map(e => [e.name, e.id]))
          const fragmentMap = new Map(createdFragments.map((f, i) => [structuredData.memoryFragments[i]?.content, f.id]))

          const entityRelations: Array<{
            memory_id: string
            entity_id: string
            importance: number
            relationship_type: string
            confidence: number
            created_at: number
          }> = []

          for (const relation of structuredData.entityRelations) {
            const entityId = entityMap.get(relation.entityName)
            const memoryId = fragmentMap.get(relation.memoryContent)

            if (entityId && memoryId) {
              entityRelations.push({
                memory_id: memoryId,
                entity_id: entityId,
                importance: relation.importance,
                relationship_type: relation.relationshipType,
                confidence: relation.confidence,
                created_at: Date.now(),
              })
            }
          }

          if (entityRelations.length > 0) {
            // console.log(`🔗 Inserting ${entityRelations.length} entity relations...`)
            await tx.insert(memoryEntityRelationsTable).values(entityRelations)
            // console.log(`✅ Entity relations inserted`)
          }
        }

        // Update consolidated memories with fragment IDs and embeddings
        if (consolidatedMemories.length > 0) {
          const consolidatedEmbeddings = await Promise.all(
            consolidatedMemories.map(cm => this.generateEmbeddings(cm.content)),
          )

          // Add embeddings and IDs to consolidated memories
          consolidatedMemories.forEach((cm, i) => {
            Object.assign(cm, consolidatedEmbeddings[i])
            cm.source_fragment_ids = JSON.stringify(createdFragments.map(f => f.id))
            cm.source_episode_ids = JSON.stringify(createdEpisodeId ? [createdEpisodeId] : [])
          })

          // console.log(`📚 Inserting ${consolidatedMemories.length} consolidated memories...`)
          await tx.insert(memoryConsolidatedMemoriesTable).values(consolidatedMemories)
          // console.log(`✅ Consolidated memories inserted`)
        }
      }

      // Create goals in bulk
      if (goals.length > 0) {
        // console.log(`🎯 Inserting ${goals.length} goals...`)
        await tx.insert(memoryLongTermGoalsTable).values(goals)
        // console.log(`✅ Goals inserted`)
      }

      // Create ideas in bulk with embeddings
      if (ideas.length > 0) {
        const ideaEmbeddings = await Promise.all(
          ideas.map(i => this.generateEmbeddings(i.content)),
        )

        // Add embeddings to ideas
        const ideasWithEmbeddings = ideas.map((idea, i) => ({
          ...idea,
          ...ideaEmbeddings[i],
        }))

        // console.log(`💭 Inserting ${ideasWithEmbeddings.length} ideas...`)
        await tx.insert(memoryShortTermIdeasTable).values(ideasWithEmbeddings)
        // console.log(`✅ Ideas inserted`)
      }
    })
    // console.log(`🎉 Database transaction completed successfully`)
  }
}
