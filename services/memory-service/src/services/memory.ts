/**
 * Memory Service Business Logic
 *
 * This file implements:
 * - Memory CRUD operations
 * - Vector similarity search
 * - Memory consolidation algorithms
 * - Memory decay calculations
 * - Session management
 */

import { and, eq, isNull } from 'drizzle-orm'

import { useDrizzle } from '../db'
import {
  chatMessagesTable,
  memoryConsolidatedMemoriesTable,
  memoryFragmentsTable,
  memoryShortTermIdeasTable,
} from '../db/schema'
import { broadcastRegenerationStatus } from '../utils/broadcast'
import { ContextBuilder } from './context-builder'
import { EmbeddingProviderFactory } from './embedding-providers/factory'
import { SettingsService } from './settings'

export interface IngestMessageRequest {
  platform: string
  content: string
}

export interface MessageResponse {
  id: string
  content: string
  platform: string
  created_at: number
}

export interface CompletionRequest {
  prompt: string
  response: string
  platform: string
  task?: string
}

export interface CompletionResponse {
  id: string
  prompt: string
  response: string
  platform: string
  created_at: number
}

export interface SearchOptions {
  query: string
  limit?: number
  similarity_threshold?: number
  platform?: string
}

export class MemoryService {
  private db = useDrizzle()
  private embeddingFactory = EmbeddingProviderFactory.getInstance()
  private settingsService = SettingsService.getInstance()
  private contextBuilder = new ContextBuilder()

  // Constants for batch size adjustment
  private readonly MIN_BATCH_SIZE = 10
  private readonly MAX_BATCH_SIZE = 200
  private readonly TARGET_BATCH_TIME_MS = 5000 // Target 5 seconds per batch
  private readonly BATCH_ADJUSTMENT_FACTOR = 0.2 // 20% adjustment up/down

  private async adjustBatchSize(currentBatchSize: number, batchTimeMs: number): Promise<number> {
    // If batch took too long, decrease size; if too fast, increase size
    const adjustment = (this.TARGET_BATCH_TIME_MS - batchTimeMs) / this.TARGET_BATCH_TIME_MS * this.BATCH_ADJUSTMENT_FACTOR
    const newSize = Math.round(currentBatchSize * (1 + adjustment))

    // Ensure we stay within bounds
    return Math.max(this.MIN_BATCH_SIZE, Math.min(this.MAX_BATCH_SIZE, newSize))
  }

  private async updateProgress(totalItems: number, processedItems: number, batchTimeMs: number): Promise<void> {
    const progress = Math.round((processedItems / totalItems) * 100)
    const settings = await this.settingsService.getSettings()

    // Calculate new average batch time
    const oldAvg = settings.mem_regeneration_avg_batch_time_ms
    const newAvg = oldAvg === 0 ? batchTimeMs : Math.round((oldAvg + batchTimeMs) / 2)

    // Calculate new batch size
    const newBatchSize = await this.adjustBatchSize(settings.mem_regeneration_current_batch_size, batchTimeMs)

    await this.settingsService.updateSettings({
      mem_regeneration_progress: progress,
      mem_regeneration_total_items: totalItems,
      mem_regeneration_processed_items: processedItems,
      mem_regeneration_avg_batch_time_ms: newAvg,
      mem_regeneration_last_batch_time_ms: batchTimeMs,
      mem_regeneration_current_batch_size: newBatchSize,
    })

    // Broadcast status update
    // TODO [lucas-oma]: might remove this:
    await broadcastRegenerationStatus(this.settingsService)
  }

  private async processBatch<T extends { id: string, content: string }>(
    items: T[],
    tableName: string,
    updateFn: (id: string, embeddings: any) => Promise<void>,
  ): Promise<void> {
    const settings = await this.settingsService.getSettings()
    const batchSize = settings.mem_regeneration_current_batch_size
    const totalItems = items.length
    let processedItems = 0

    // Process in dynamic-sized batches
    for (let i = 0; i < items.length; i += batchSize) {
      const batchStart = Date.now()
      const batch = items.slice(i, i + batchSize)

      // Process batch in parallel
      await Promise.all(batch.map(async (item) => {
        const embeddings = await this.embeddingFactory.generateEmbedding(item.content)
        await updateFn(item.id, embeddings)
      }))

      // Update progress and adjust batch size
      processedItems += batch.length
      const batchTimeMs = Date.now() - batchStart
      await this.updateProgress(totalItems, processedItems, batchTimeMs)
    }
  }

  /**
   * Trigger regeneration of all embeddings
   * This will:
   * 1. Set all embeddings to null
   * 2. Regenerate embeddings using current settings in parallel batches
   */
  async triggerEmbeddingRegeneration(onlyNullEmbeddings = false): Promise<void> {
    try {
      // Reset progress tracking at start
      await this.settingsService.updateSettings({
        mem_regeneration_progress: 0,
        mem_regeneration_total_items: 0,
        mem_regeneration_processed_items: 0,
        mem_regeneration_avg_batch_time_ms: 0,
        mem_regeneration_last_batch_time_ms: 0,
        mem_regeneration_current_batch_size: 50, // Start with default size
      })

      // First nullify all embeddings if not only processing null ones
      if (!onlyNullEmbeddings) {
        await this.db.transaction(async (tx) => {
          // Nullify chat messages embeddings
          await tx.update(chatMessagesTable)
            .set({
              content_vector_1536: null,
              content_vector_1024: null,
              content_vector_768: null,
            })

          // Nullify memory fragments embeddings
          await tx.update(memoryFragmentsTable)
            .set({
              content_vector_1536: null,
              content_vector_1024: null,
              content_vector_768: null,
            })

          // Nullify short term ideas embeddings
          await tx.update(memoryShortTermIdeasTable)
            .set({
              content_vector_1536: null,
              content_vector_1024: null,
              content_vector_768: null,
            })

          // Nullify consolidated memories embeddings
          await tx.update(memoryConsolidatedMemoriesTable)
            .set({
              content_vector_1536: null,
              content_vector_1024: null,
              content_vector_768: null,
            })
        })
      }

      // Fetch all content that needs embeddings (either all or only null ones)
      const [messages, fragments, ideas, memories] = await Promise.all([
        this.db.select({
          id: chatMessagesTable.id,
          content: chatMessagesTable.content,
        })
          .from(chatMessagesTable)
          .where(onlyNullEmbeddings
            ? and(
                isNull(chatMessagesTable.content_vector_1536),
                isNull(chatMessagesTable.content_vector_1024),
                isNull(chatMessagesTable.content_vector_768),
              )
            : undefined),

        this.db.select({
          id: memoryFragmentsTable.id,
          content: memoryFragmentsTable.content,
        })
          .from(memoryFragmentsTable)
          .where(onlyNullEmbeddings
            ? and(
                isNull(memoryFragmentsTable.content_vector_1536),
                isNull(memoryFragmentsTable.content_vector_1024),
                isNull(memoryFragmentsTable.content_vector_768),
              )
            : undefined),

        this.db.select({
          id: memoryShortTermIdeasTable.id,
          content: memoryShortTermIdeasTable.content,
        })
          .from(memoryShortTermIdeasTable)
          .where(onlyNullEmbeddings
            ? and(
                isNull(memoryShortTermIdeasTable.content_vector_1536),
                isNull(memoryShortTermIdeasTable.content_vector_1024),
                isNull(memoryShortTermIdeasTable.content_vector_768),
              )
            : undefined),

        this.db.select({
          id: memoryConsolidatedMemoriesTable.id,
          content: memoryConsolidatedMemoriesTable.content,
        })
          .from(memoryConsolidatedMemoriesTable)
          .where(onlyNullEmbeddings
            ? and(
                isNull(memoryConsolidatedMemoriesTable.content_vector_1536),
                isNull(memoryConsolidatedMemoriesTable.content_vector_1024),
                isNull(memoryConsolidatedMemoriesTable.content_vector_768),
              )
            : undefined),
      ])

      // Update total items count
      const totalItems = messages.length + fragments.length + ideas.length + memories.length
      await this.settingsService.updateSettings({
        mem_regeneration_total_items: totalItems,
      })

      // Process each table in parallel batches
      await Promise.all([
        this.processBatch(messages, 'chat_messages', async (id, embeddings) => {
          await this.db.update(chatMessagesTable)
            .set(embeddings)
            .where(eq(chatMessagesTable.id, id))
        }),

        this.processBatch(fragments, 'memory_fragments', async (id, embeddings) => {
          await this.db.update(memoryFragmentsTable)
            .set(embeddings)
            .where(eq(memoryFragmentsTable.id, id))
        }),

        this.processBatch(ideas, 'short_term_ideas', async (id, embeddings) => {
          await this.db.update(memoryShortTermIdeasTable)
            .set(embeddings)
            .where(eq(memoryShortTermIdeasTable.id, id))
        }),

        this.processBatch(memories, 'consolidated_memories', async (id, embeddings) => {
          await this.db.update(memoryConsolidatedMemoriesTable)
            .set(embeddings)
            .where(eq(memoryConsolidatedMemoriesTable.id, id))
        }),
      ])

      console.warn('Embedding regeneration completed successfully')
    }
    catch (error) {
      console.error('Failed to regenerate embeddings:', error)
      throw error
    }
  }

  // Check and resume regeneration if needed
  async checkAndResumeRegeneration(): Promise<void> {
    try {
      const settingsService = SettingsService.getInstance()
      const settings = await settingsService.getSettings()

      if (settings.mem_is_regenerating) {
        console.warn('Found incomplete regeneration, resuming...')
        try {
          // Only process NULL embeddings since we're resuming
          await this.triggerEmbeddingRegeneration(true)
        }
        finally {
          // Clear regenerating state
          await settingsService.updateSettings({
            mem_is_regenerating: false,
          })
        }
      }
    }
    catch (error) {
      // Log error but don't crash the service
      console.error('Error checking regeneration status', error)
      // We'll try again on next service restart if needed
    }
  }

  /**
   * Ingest a new message (store raw message for later processing)
   */
  async ingestMessage(data: IngestMessageRequest): Promise<MessageResponse> {
    try {
      // Generate embeddings based on current settings
      const embeddings = await this.embeddingFactory.generateEmbedding(data.content)

      // Insert the message into chatMessagesTable
      const [result] = await this.db.insert(chatMessagesTable).values({
        platform: data.platform,
        content: data.content,
        is_processed: false, // Mark as unprocessed initially
        created_at: Date.now(),
        updated_at: Date.now(),
        ...embeddings, // Spread the embeddings object which has the right dimensions
      }).returning({
        id: chatMessagesTable.id,
        content: chatMessagesTable.content,
        platform: chatMessagesTable.platform,
        created_at: chatMessagesTable.created_at,
      })

      return {
        id: result.id,
        content: result.content,
        platform: result.platform,
        created_at: result.created_at,
      }
    }
    catch (error) {
      console.error('Failed to create memory:', error)
      throw new Error(`Failed to create memory: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get message by ID
   */
  async getMessage(id: string): Promise<MessageResponse | null> {
    try {
      const [result] = await this.db
        .select({
          id: chatMessagesTable.id,
          content: chatMessagesTable.content,
          platform: chatMessagesTable.platform,
          created_at: chatMessagesTable.created_at,
        })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.id, id))

      if (!result)
        return null

      return {
        id: result.id,
        content: result.content,
        platform: result.platform,
        created_at: result.created_at,
      }
    }
    catch (error) {
      console.error('Failed to get message:', error)
      throw new Error(`Failed to get message: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Store a chat completion (AI response with prompt)
   */
  async storeCompletion(data: CompletionRequest): Promise<CompletionResponse> {
    try {
      // Import the completions table schema
      const { chatCompletionsHistoryTable } = await import('../db/schema.js')

      // Insert the completion into chatCompletionsHistoryTable
      const [result] = await this.db.insert(chatCompletionsHistoryTable).values({
        prompt: data.prompt,
        response: data.response,
        task: data.task || 'chat', // Default task type
        created_at: Date.now(),
      }).returning({
        id: chatCompletionsHistoryTable.id,
        prompt: chatCompletionsHistoryTable.prompt,
        response: chatCompletionsHistoryTable.response,
        task: chatCompletionsHistoryTable.task,
        created_at: chatCompletionsHistoryTable.created_at,
      })

      return {
        id: result.id,
        prompt: result.prompt,
        response: data.response,
        platform: data.platform, // Store platform in our response
        created_at: result.created_at,
      }
    }
    catch (error) {
      console.error('Failed to store completion:', error)
      throw new Error(`Failed to store completion: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Build context for a query using the context builder
   */
  async buildQueryContext(query: string) {
    try {
      return await this.contextBuilder.buildContext(query)
    }
    catch (error) {
      console.error('Failed to build context:', error)
      return null
    }
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    // Redis connection cleanup handled by RedisQueueService singleton
    // TODO [lucas-oma] remove this legacy
  }

  // TODO: Implement memory search
  // async searchMemories(query: string, options: SearchOptions): Promise<MemoryResponse[]> {
  //   // This would use vector similarity search with pgvector
  //   // For now, return empty array
  //   return []
  // }
}
