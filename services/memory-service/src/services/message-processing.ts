import { asc, eq, inArray } from 'drizzle-orm'

import { useDrizzle } from '../db/index.js'
import { chatMessagesTable } from '../db/schema.js'

export class MessageIngestionService {
  private static instance: MessageIngestionService | null = null
  private db = useDrizzle()

  public static getInstance(): MessageIngestionService {
    if (!MessageIngestionService.instance) {
      MessageIngestionService.instance = new MessageIngestionService()
    }
    return MessageIngestionService.instance
  }

  private constructor() {
    console.warn('📋 Message ingestion service initialized')
  }

  /**
   * Mark a message as ready for processing
   */
  async markMessageForProcessing(messageId: string): Promise<void> {
    // console.log(`🔄 Marking message ${messageId} for processing...`)
    // console.log(`📝 Message content: ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`)

    try {
      // The message is already in chatMessagesTable, we just ensure it's marked as unprocessed
      await this.db
        .update(chatMessagesTable)
        .set({
          is_processed: false, // Mark as ready for processing
          updated_at: Date.now(),
        })
        .where(eq(chatMessagesTable.id, messageId))

      // const pendingCount = await this.getQueueLength()
      // console.log(`✅ Successfully marked message ${messageId} for processing`)
      // console.log(`📊 Pending messages: ${pendingCount}`)
    }
    catch (error) {
      console.error(`❌ Failed to mark message ${messageId} for processing:`, error)
      throw error
    }
  }

  /**
   * Get batch of unprocessed messages ready for ingestion
   */
  async getUnprocessedBatch(size: number): Promise<Array<{ messageId: string, content: string, timestamp: number }>> {
    try {
      const messages = await this.db
        .select({
          id: chatMessagesTable.id,
          content: chatMessagesTable.content,
          created_at: chatMessagesTable.created_at,
        })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.is_processed, false)) // Get unprocessed messages (false, not NULL)
        .orderBy(asc(chatMessagesTable.created_at)) // Process oldest first
        .limit(size)

      return messages.map(msg => ({
        messageId: msg.id,
        content: msg.content,
        timestamp: msg.created_at,
      }))
    }
    catch (error) {
      console.error('Failed to get unprocessed batch:', error)
      return []
    }
  }

  /**
   * Mark messages as processed (remove from queue)
   */
  async markMessagesAsProcessed(messageIds: string[]): Promise<void> {
    try {
      // Update all messages in batch using IN clause
      await this.db
        .update(chatMessagesTable)
        .set({
          is_processed: true,
          updated_at: Date.now(),
        })
        .where(inArray(chatMessagesTable.id, messageIds)) // Update all messages in batch

      // console.log(`✅ Marked ${messageIds.length} messages as processed`)
    }
    catch (error) {
      if (error instanceof Error && error.message.includes('relation "chat_messages" does not exist')) {
        console.warn('Chat messages table does not exist yet, skipping message processing')
        return
      }
      console.error('Failed to mark messages as processed:', error)
      throw error
    }
  }

  /**
   * Get current queue length
   */
  async getQueueLength(): Promise<number> {
    try {
      const result = await this.db
        .select({ count: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(eq(chatMessagesTable.is_processed, false)) // Look for false, not NULL

      return result.length
    }
    catch (error) {
      console.error('Failed to get queue length:', error)
      return 0
    }
  }

  /**
   * Get queue status (for monitoring)
   */
  async getQueueStatus(): Promise<{
    waiting: number
    active: number
    completed: number
    failed: number
  }> {
    try {
      const [waiting, completed] = await Promise.all([
        this.db
          .select({ count: chatMessagesTable.id })
          .from(chatMessagesTable)
          .where(eq(chatMessagesTable.is_processed, false)), // Look for false, not NULL
        this.db
          .select({ count: chatMessagesTable.id })
          .from(chatMessagesTable)
          .where(eq(chatMessagesTable.is_processed, true)),
      ])

      return {
        waiting: waiting.length,
        active: 0, // No active concept in PostgreSQL queue
        completed: completed.length,
        failed: 0, // No failed concept in PostgreSQL queue
      }
    }
    catch (error) {
      console.error('Failed to get queue status:', error)
      return { waiting: 0, active: 0, completed: 0, failed: 0 }
    }
  }

  /**
   * Clear the entire queue (for testing/debugging)
   */
  async clearQueue(): Promise<void> {
    try {
      await this.db
        .update(chatMessagesTable)
        .set({
          is_processed: true,
          updated_at: Date.now(),
        })
        .where(eq(chatMessagesTable.is_processed, false)) // Look for false, not NULL

      // console.log('🧹 Queue cleared (all messages marked as processed)')
    }
    catch (error) {
      console.error('Failed to clear queue:', error)
      throw error
    }
  }

  /**
   * Acquire PostgreSQL advisory lock
   */
  async acquireLock(lockId: number): Promise<boolean> {
    try {
      // Use raw SQL for PostgreSQL advisory locks
      const result = await this.db.execute(
        `SELECT pg_try_advisory_lock(${lockId})`,
      )

      // Debug: Log the result structure
      // console.log(`🔒 Lock result structure:`, JSON.stringify(result, null, 2))

      // pg_try_advisory_lock returns true if lock acquired, false if not
      // The result structure has rows array with the actual data
      if (result.rows && Array.isArray(result.rows) && result.rows.length > 0) {
        const lockResult = result.rows[0]
        const acquired = lockResult.pg_try_advisory_lock === true
        // console.log(`🔒 Lock acquired: ${acquired}, lockResult:`, lockResult)
        return acquired
      }
      // console.log(`🔒 No rows array, returning false`)
      return false
    }
    catch (error) {
      console.error('Failed to acquire lock:', error)
      return false
    }
  }

  /**
   * Release PostgreSQL advisory lock
   */
  async releaseLock(lockId: number): Promise<void> {
    try {
      await this.db.execute(`SELECT pg_advisory_unlock(${lockId})`)
    }
    catch (error) {
      console.error('Failed to release lock:', error)
    }
  }
}
