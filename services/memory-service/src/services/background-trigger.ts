/**
 * Background Trigger Service
 *
 * This service handles:
 * - Polling for unprocessed messages
 * - Triggering batch processing
 * - Managing processing intervals
 */

// TODO [lucas-oma]: remove console.log comments

import type { BuiltContext } from './context-builder'
import type { MessageIngestionService } from './message-processing.js'

import { asc, inArray } from 'drizzle-orm'

import { useDrizzle } from '../db/index.js'
import { chatMessagesTable } from '../db/schema.js'
import { LLMMemoryManager } from './llm-memory-manager.js'

export interface ProcessingBatch {
  messageIds: string[]
  messages: QueuedMessage[]
  modelName: string
  context?: BuiltContext // Optional context for the batch (only used when user sends a message)
}

interface QueuedMessage {
  id: string
  content: string
  platform: string
  created_at: number
  model_name: string
}

export class BackgroundTrigger {
  private static instance: BackgroundTrigger | null = null
  private db = useDrizzle()
  private llmManager = new LLMMemoryManager()
  private messageIngestion: MessageIngestionService
  private isProcessing = false
  private lockId = 12345 // Fixed PostgreSQL advisory lock ID
  private isStarted = false // Prevent multiple start calls

  private constructor(messageIngestion: MessageIngestionService) {
    this.messageIngestion = messageIngestion
  }

  public static getInstance(messageIngestion: MessageIngestionService): BackgroundTrigger {
    if (!BackgroundTrigger.instance) {
      BackgroundTrigger.instance = new BackgroundTrigger(messageIngestion)
    }
    return BackgroundTrigger.instance
  }

  /**
   * Start periodic background processing
   */
  startProcessing(intervalMs: number): void {
    if (this.isStarted) {
      console.warn(`⚠️ Background processing already started, ignoring duplicate call`)
      return
    }

    this.isStarted = true
    // console.log(`🚀 Background processing started with interval: ${intervalMs}ms`)
    // console.log(`🆔 BackgroundTrigger instance ID: ${Math.random().toString(36).substr(2, 9)}`)
    setInterval(() => {
      this.processBatch().catch(console.error)
    }, intervalMs)
  }

  /**
   * Process a batch of unprocessed messages
   */
  private async processBatch(): Promise<void> {
    // CRITICAL: Prevent overlap between processing cycles
    if (this.isProcessing) {
      console.warn('🔄 Already processing, skipping batch (overlap protection)')
      return
    }

    // console.log('🔒 Attempting to acquire PostgreSQL advisory lock...')
    this.isProcessing = true

    try {
      // Try to acquire PostgreSQL advisory lock to prevent multiple instances
      const lockAcquired = await this.messageIngestion.acquireLock(this.lockId)
      if (!lockAcquired) {
        console.warn('⚠️ Could not acquire lock, skipping batch')
        return
      }

      // console.log('🔒 PostgreSQL advisory lock acquired')

      // Get unprocessed messages from PostgreSQL queue
      const messages = await this.getUnprocessedMessages(10)

      if (messages.length === 0) {
        // console.log('📭 No messages to process')
        return
      }

      // console.log(`📥 Processing batch of ${messages.length} messages`)

      // Create smart batches based on content length
      const batches = this.createBatches(messages, 10)

      // Process each batch
      for (const batch of batches) {
        await this.processMessageBatch(batch)
      }

      // console.log('✅ Batch processing completed')
    }
    catch (error) {
      console.error('❌ Error in batch processing:', error)
    }
    finally {
      // Release the PostgreSQL advisory lock
      await this.messageIngestion.releaseLock(this.lockId)
      // console.log('🔓 Releasing PostgreSQL advisory lock...')
      this.isProcessing = false
    }
  }

  /**
   * Get unprocessed messages from PostgreSQL queue
   */
  private async getUnprocessedMessages(limit: number): Promise<QueuedMessage[]> {
    try {
      // Get unprocessed messages
      const queuedMessages = await this.messageIngestion.getUnprocessedBatch(limit)

      if (queuedMessages.length === 0) {
        return []
      }

      // Get message IDs from queue
      const messageIds = queuedMessages.map(msg => msg.messageId)

      // Fetch full message details from database
      const messages = await this.db
        .select({
          id: chatMessagesTable.id,
          content: chatMessagesTable.content,
          platform: chatMessagesTable.platform,
          created_at: chatMessagesTable.created_at,
          model_name: chatMessagesTable.model_name,
        })
        .from(chatMessagesTable)
        .where(inArray(chatMessagesTable.id, messageIds))
        .orderBy(asc(chatMessagesTable.created_at))

      return messages
    }
    catch (error) {
      console.error('Failed to get unprocessed messages:', error)
      return []
    }
  }

  /**
   * Create smart batches based on content length and token estimation
   */
  private createBatches(messages: QueuedMessage[], maxBatchSize: number): ProcessingBatch[] {
    if (messages.length === 0)
      return []

    const batches: ProcessingBatch[] = []
    const messagesByModel = messages.reduce((acc, message) => {
      if (!acc[message.model_name])
        acc[message.model_name] = []
      acc[message.model_name]!.push(message)
      return acc
    }, {} as Record<string, QueuedMessage[]>)

    for (const [modelName, groupedMessages] of Object.entries(messagesByModel)) {
      const sortedMessages = [...groupedMessages].sort((a, b) => a.content.length - b.content.length)

      let currentBatch: QueuedMessage[] = []
      let currentBatchTokens = 0

      for (const message of sortedMessages) {
        const messageTokens = this.estimateTokenCount(message.content)

        if (currentBatch.length > 0 && currentBatchTokens + messageTokens > 4000) {
          batches.push({
            messageIds: currentBatch.map(m => m.id),
            messages: currentBatch,
            modelName,
          })
          currentBatch = []
          currentBatchTokens = 0
        }

        currentBatch.push(message)
        currentBatchTokens += messageTokens

        if (currentBatch.length >= maxBatchSize) {
          batches.push({
            messageIds: currentBatch.map(m => m.id),
            messages: currentBatch,
            modelName,
          })
          currentBatch = []
          currentBatchTokens = 0
        }
      }

      if (currentBatch.length > 0) {
        batches.push({
          messageIds: currentBatch.map(m => m.id),
          messages: currentBatch,
          modelName,
        })
      }
    }

    return batches
  }

  /**
   * Estimate token count based on content length
   */
  private estimateTokenCount(content: string): number {
    // Conservative estimation: 1 token ≈ 4 characters for English text
    // This accounts for spaces, punctuation, and mixed content
    return Math.ceil(content.length / 4)
  }

  /**
   * Process a single batch of messages
   */
  private async processMessageBatch(batch: ProcessingBatch): Promise<void> {
    try {
      // console.log(`🔄 Processing batch with ${batch.messages.length} messages`)
      // console.log(`📋 Message IDs: ${batch.messageIds.join(', ')}`)
      // console.log(`📝 Message contents: ${batch.messages.map(m => m.content.substring(0, 30)).join(' | ')}`)

      // Send batch to LLM Memory Manager
      await this.llmManager.processBatch(batch)

      // Mark messages as processed in database
      await this.markMessagesAsProcessed(batch.messageIds)

      // Mark messages as processed
      await this.messageIngestion.markMessagesAsProcessed(batch.messageIds)

      // console.log(`✅ Successfully processed batch of ${batch.messages.length} messages`)
    }
    catch (error) {
      console.error('❌ Error processing batch:', error)
      // TODO: Implement retry logic or move to dead letter queue
    }
  }

  /**
   * Mark messages as processed in database
   */
  private async markMessagesAsProcessed(messageIds: string[]): Promise<void> {
    // console.log(`🏁 Marking ${messageIds.length} messages as processed...`)

    try {
      // Update database
      await this.db
        .update(chatMessagesTable)
        .set({
          is_processed: true,
          updated_at: Date.now(),
        })
        .where(inArray(chatMessagesTable.id, messageIds))

      // console.log(`✅ Database updated for ${messageIds.length} messages`)
    }
    catch (error) {
      console.error('❌ Failed to mark messages as processed:', error)
      throw error
    }
  }
}
