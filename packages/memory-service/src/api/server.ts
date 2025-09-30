/**
 * REST API Server for Memory Service
 *
 * This file implements:
 * - Express server setup with middleware
 * - REST API endpoints for memory operations
 * - Authentication and authorization
 * - Request validation and error handling
 * - CORS and security headers
 */

import { env } from 'node:process'

import { cors } from '@elysiajs/cors'
import { desc, sql } from 'drizzle-orm'
import { Elysia, t } from 'elysia'

import memoryRouter from './memory'

import {
  isEmbeddedPostgresEnabled,
  isPGliteEnabled,
  setEmbeddedPostgresEnabled,
  setPGliteEnabled,
  useDrizzle,
} from '../db/index.js'
import { chatCompletionsHistoryTable, chatMessagesTable } from '../db/schema.js'
import { MemoryService } from '../services/memory'
import { SettingsService } from '../services/settings'

export function createApp() {
  const memoryService = new MemoryService()
  const settingsService = SettingsService.getInstance()

  const app = new Elysia({ prefix: '/api' })

  // Middleware
  app.use(cors())
  app.use(memoryRouter)

  // Health check endpoint
  const unauthedApp = new Elysia()
    .get('/api/health', () => {
      return { status: 'ok', timestamp: new Date().toISOString() }
    })

  app
    .use(unauthedApp)
  // Test authentication endpoint
  app.get('/test-conn', () => {
    return {
      status: 'authenticated',
      timestamp: new Date().toISOString(),
      message: 'API key is valid',
    }
  })

  // Get current database URL from environment
  app.get('/database-url', () => {
    const dbUrl = env.PG_URL || 'ERROR: PG_URL environment variable not configured'
    // Censor the password in the URL for security
    const censoredUrl = dbUrl.replace(/:([^:@]+)@/, ':*****@')
    return {
      dbUrl: censoredUrl,
      message: 'Database connection is configured via PG_URL environment variable',
    }
  })
  // Message ingestion endpoint
  app.post(
    '/messages',
    async ({ body, set }) => {
      const {
        content,
        platform,
      } = body as { content: string, platform?: string }

      const messageData = {
        content,
        platform: platform || '',
      }

      try {
        const result = await memoryService.ingestMessage(messageData as any)
        return result
      }
      catch (error) {
        console.error('Failed to ingest message:', error)
        set.status = 500
        return {
          error: 'Failed to ingest message',
          details: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    },
    {
      body: t.Object({
        content: t.String(),
        platform: t.Optional(t.String()),
      }),
    },
  )

  // Replace the original route definition block (Lines 104-110)

  app.post(
    '/completions',
    async ({ body, set }: { body: { prompt: string, response: string, platform?: string }, set: any }) => {
      const { prompt, response, platform } = body
      const completionData = {
        prompt,
        response,
        platform: platform || '',
      }
      try {
        const result = await memoryService.storeCompletion(completionData as any)
        return result
      }
      catch (error) {
        console.error('Failed to store completion:', error)
        set.status = 500
        return {
          error: 'Failed to store completion',
          details: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    },
    {
      body: t.Object({
        prompt: t.String(),
        response: t.String(),
        platform: t.Optional(t.String()),
      }),
    },
  )

  // iet current embedded Postgres status
  app.get('/embedded-postgres', () => {
    return { enabled: isEmbeddedPostgresEnabled() }
  })

  // Update embedded Postgres status
  app.post('/embedded-postgres', (body: any) => {
    const { enabled } = body as { enabled: boolean }
    setEmbeddedPostgresEnabled(enabled)
    return { success: true, enabled: isEmbeddedPostgresEnabled() }
  }, {
    body: t.Object({ enabled: t.Boolean() }),
  })

  // Get current PGlite status
  app.get('/pglite', () => {
    return { enabled: isPGliteEnabled() }
  })

  // Update PGlite status
  app.post('/pglite', (body: any) => {
    const { enabled } = body as { enabled: boolean }
    setPGliteEnabled(enabled)
    return { success: true, enabled: isPGliteEnabled() }
  }, {
    body: t.Object({ enabled: t.Boolean() }),
  })

  // Update memory service settings
  app.post('/settings', async ({ body, set }) => {
    try {
      const {
        // LLM settings
        llmProvider,
        llmModel,
        llmApiKey,
        llmTemperature,
        llmMaxTokens,
        // Embedding settings
        embeddingProvider,
        embeddingModel,
        embeddingApiKey,
        embeddingDimensions,
      } = body

      // Get current settings to compare
      const currentSettings = await settingsService.getSettings()

      // Check if embeddings are being regenerated
      if (
        currentSettings.mem_is_regenerating
        && (
          currentSettings.mem_embedding_provider !== embeddingProvider
          || currentSettings.mem_embedding_model !== embeddingModel
          || currentSettings.mem_embedding_dimensions !== embeddingDimensions
        )
      ) {
        set.status = 409
        return {
          error: 'Cannot change embedding settings while regeneration is in progress',
          details: 'Please wait for the current regeneration to complete',
        }
      }

      // Update settings first
      await settingsService.updateSettings({
        // LLM settings
        mem_llm_provider: llmProvider,
        mem_llm_model: llmModel,
        mem_llm_api_key: llmApiKey,
        mem_llm_temperature: llmTemperature,
        mem_llm_max_tokens: llmMaxTokens,
        // Embedding settings
        mem_embedding_provider: embeddingProvider,
        mem_embedding_model: embeddingModel,
        mem_embedding_api_key: embeddingApiKey,
        mem_embedding_dimensions: embeddingDimensions,
      })

      // Only trigger regeneration if embedding-related settings changed AND not already regenerating
      const embeddingChanged
        = currentSettings.mem_embedding_provider !== embeddingProvider
          || currentSettings.mem_embedding_model !== embeddingModel
          || currentSettings.mem_embedding_dimensions !== embeddingDimensions

      if (!currentSettings.mem_is_regenerating && embeddingChanged) {
        // Set regenerating state
        await settingsService.updateSettings({ mem_is_regenerating: true })

        // Send response immediately
        set.status = 200
        const response = {
          status: 'success',
          message: 'Settings updated successfully. Embedding regeneration started in background.',
          isRegenerating: true,
        }

        // Process in background
        set.event = async () => {
          try {
            // This will process everything in parallel but wait for completion
            await memoryService.triggerEmbeddingRegeneration()
          }
          finally {
            // Always clear regenerating state
            await settingsService.updateSettings({ mem_is_regenerating: false })
          }
        }

        return response // Already sent response
      }

      // If no regeneration needed, respond normally
      return {
        status: 'success',
        message: 'Settings updated successfully',
      }
    }
    catch (error) {
      console.error('Failed to update settings:', error)
      set.status = 500
      return {
        error: 'Failed to update settings',
        details: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }, {
    body: t.Object({
      llmProvider: t.Optional(t.String()),
      llmModel: t.Optional(t.String()),
      llmApiKey: t.Optional(t.String()),
      llmTemperature: t.Optional(t.Number()),
      llmMaxTokens: t.Optional(t.Number()),
      embeddingProvider: t.Optional(t.String()),
      embeddingModel: t.Optional(t.String()),
      embeddingApiKey: t.Optional(t.String()),
      embeddingDimensions: t.Optional(t.Number()),
    }),
  })

  // Get regeneration status endpoint
  app.get('/settings/regeneration-status', async (set: any) => {
    try {
      const settings = await settingsService.getSettings()

      const estimatedTimeRemaining = settings.mem_regeneration_total_items > 0
        ? Math.round(
            (settings.mem_regeneration_total_items - settings.mem_regeneration_processed_items)
            * (settings.mem_regeneration_avg_batch_time_ms / settings.mem_regeneration_current_batch_size),
          )
        : null

      return {
        isRegenerating: settings.mem_is_regenerating,
        progress: settings.mem_regeneration_progress,
        totalItems: settings.mem_regeneration_total_items,
        processedItems: settings.mem_regeneration_processed_items,
        avgBatchTimeMs: settings.mem_regeneration_avg_batch_time_ms,
        lastBatchTimeMs: settings.mem_regeneration_last_batch_time_ms,
        currentBatchSize: settings.mem_regeneration_current_batch_size,
        // Rough ETA based on average batch time and current batch size
        estimatedTimeRemaining,
      }
    }
    catch (error) {
      console.error('Failed to get regeneration status:', error)
      set.status = 500
      return {
        error: 'Failed to get regeneration status',
        details: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

  // Get context for a message
  app.post('/context', async ({ body, set }) => {
    try {
      const { message } = body
      if (!message) {
        set.status = 400
        return { error: 'message is required' }
      }

      // Store the message first so it's included in context building
      await memoryService.ingestMessage({
        content: message,
        platform: 'web',
      })

      // Build context using ContextBuilder
      const context = await memoryService.buildQueryContext(message)

      return context
    }
    catch (error) {
      console.error('Failed to build context:', error)
      set.status = 500
      return {
        error: 'Failed to build context',
        details: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }, {
    body: t.Object({ message: t.String() }),
  })

  // Get paginated conversation history
  app.get('/conversations', async ({ query, set }) => {
    try {
      const db = useDrizzle()

      // Pagination params
      const limit = Number.parseInt(query.limit as string) || 10
      const before = Number.parseInt(query.before as string) || Date.now() // timestamp for pagination

      // Get messages and completions before the timestamp
      const [messages, completions] = await Promise.all([
        // Get user messages
        db.select({
          id: chatMessagesTable.id,
          content: chatMessagesTable.content,
          platform: chatMessagesTable.platform,
          created_at: chatMessagesTable.created_at,
          type: sql<'user'>`'user'`.as('type'),
        })
          .from(chatMessagesTable)
          .where(sql`${chatMessagesTable.created_at} < ${before}`)
          .orderBy(desc(chatMessagesTable.created_at))
          .limit(limit),

        // Get AI completions
        db.select({
          id: chatCompletionsHistoryTable.id,
          content: chatCompletionsHistoryTable.response,
          task: chatCompletionsHistoryTable.task,
          created_at: chatCompletionsHistoryTable.created_at,
          type: sql<'assistant'>`'assistant'`.as('type'),
        })
          .from(chatCompletionsHistoryTable)
          .where(sql`${chatCompletionsHistoryTable.created_at} < ${before}`)
          .orderBy(desc(chatCompletionsHistoryTable.created_at))
          .limit(limit),
      ])

      // Merge and sort by timestamp
      const conversation = [...messages, ...completions]
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, limit)

      // Get the earliest timestamp for next page
      const earliestTimestamp = conversation[conversation.length - 1]?.created_at

      return {
        messages: conversation.reverse(), // reversed to get chat-style order
        hasMore: conversation.length === limit,
        nextCursor: earliestTimestamp,
      }
    }
    catch (error) {
      console.error('Failed to fetch conversation history:', error)
      set.status = 500
      return {
        error: 'Failed to fetch conversation history',
        details: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  })

  return app
}
