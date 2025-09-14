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

import cors from 'cors'
import express from 'express'

import { desc, sql } from 'drizzle-orm'

import { isEmbeddedPostgresEnabled, setEmbeddedPostgresEnabled, useDrizzle } from '../db'
import { chatCompletionsHistoryTable, chatMessagesTable } from '../db/schema'
import { MemoryService } from '../services/memory'
import { SettingsService } from '../services/settings'

// Simple authentication middleware
function authenticateApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  // If API_KEY is empty or not set, skip authentication entirely
  if (!env.API_KEY || env.API_KEY === '') {
    return next()
  }

  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'API key required' })
  }

  const apiKey = authHeader.split(' ')[1]
  if (apiKey !== env.API_KEY) {
    return res.status(403).json({ error: 'Invalid API key' })
  }

  next()
}

export function createApp() {
  const app = express()
  const memoryService = new MemoryService()
  const settingsService = SettingsService.getInstance()

  // Middleware
  app.use(cors())
  app.use(express.json())

  // Health check endpoint (no auth required)
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // Test authentication endpoint
  app.get('/api/test-conn', authenticateApiKey, (req, res) => {
    res.json({
      status: 'authenticated',
      timestamp: new Date().toISOString(),
      message: 'API key is valid',
    })
  })
  // Get current database URL from environment
  app.get('/api/database-url', authenticateApiKey, (req, res) => {
    const dbUrl = env.DATABASE_URL || 'ERROR: DATABASE_URL environment variable not configured'

    // Censor the password in the URL for security
    const censoredUrl = dbUrl.replace(/:([^:@]+)@/, ':*****@')

    res.json({
      dbUrl: censoredUrl,
      message: 'Database connection is configured via DATABASE_URL environment variable',
    })
  })

  // Message ingestion endpoint
  app.post('/api/messages', authenticateApiKey, async (req, res) => {
    try {
      const result = await memoryService.ingestMessage(req.body)
      res.json(result)
    }
    catch (error) {
      console.error('Failed to ingest message:', error)
      res.status(500).json({
        error: 'Failed to ingest message',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // Store AI completion endpoint
  app.post('/api/completions', authenticateApiKey, async (req, res) => {
    try {
      const result = await memoryService.storeCompletion(req.body)
      res.json(result)
    }
    catch (error) {
      console.error('Failed to store completion:', error)
      res.status(500).json({
        error: 'Failed to store completion',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // Get current embedded Postgres status
  app.get('/api/embedded-postgres', authenticateApiKey, (_req, res) => {
    res.json({ enabled: isEmbeddedPostgresEnabled() })
  })

  // Update embedded Postgres status
  app.post('/api/embedded-postgres', authenticateApiKey, (req, res) => {
    const { enabled } = req.body as { enabled: boolean }
    setEmbeddedPostgresEnabled(enabled)
    res.json({ success: true, enabled: isEmbeddedPostgresEnabled() })
  })

  // Update memory service settings
  app.post('/api/settings', authenticateApiKey, async (req, res) => {
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
      } = req.body

      // Get current settings to compare
      const currentSettings = await settingsService.getSettings()

      // Check if embeddings are being regenerated
      if (currentSettings.mem_is_regenerating && (
        currentSettings.mem_embedding_provider !== embeddingProvider
        || currentSettings.mem_embedding_model !== embeddingModel
        || currentSettings.mem_embedding_dimensions !== embeddingDimensions
      )) {
        return res.status(409).json({
          error: 'Cannot change embedding settings while regeneration is in progress',
          details: 'Please wait for the current regeneration to complete',
        })
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
      if (
        !currentSettings.mem_is_regenerating && (
          currentSettings.mem_embedding_provider !== embeddingProvider
          || currentSettings.mem_embedding_model !== embeddingModel
          || currentSettings.mem_embedding_dimensions !== embeddingDimensions
        )
      ) {
        // Set regenerating state
        await settingsService.updateSettings({
          mem_is_regenerating: true,
        })

        // Send response immediately
        res.json({
          status: 'success',
          message: 'Settings updated successfully. Embedding regeneration started in background.',
          isRegenerating: true,
        })

        // Process in background
        try {
          // This will process everything in parallel but wait for completion
          await memoryService.triggerEmbeddingRegeneration()
        }
        finally {
          // Always clear regenerating state
          await settingsService.updateSettings({
            mem_is_regenerating: false,
          })
        }
        return // Already sent response
      }

      // If no regeneration needed, respond normally
      res.json({
        status: 'success',
        message: 'Settings updated successfully',
      })
    }
    catch (error) {
      console.error('Failed to update settings:', error)
      res.status(500).json({
        error: 'Failed to update settings',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // Get regeneration status endpoint
  app.get('/api/settings/regeneration-status', authenticateApiKey, async (req, res) => {
    try {
      const settings = await settingsService.getSettings()

      res.json({
        isRegenerating: settings.mem_is_regenerating,
        progress: settings.mem_regeneration_progress,
        totalItems: settings.mem_regeneration_total_items,
        processedItems: settings.mem_regeneration_processed_items,
        avgBatchTimeMs: settings.mem_regeneration_avg_batch_time_ms,
        lastBatchTimeMs: settings.mem_regeneration_last_batch_time_ms,
        currentBatchSize: settings.mem_regeneration_current_batch_size,
        estimatedTimeRemaining: settings.mem_regeneration_total_items > 0
          ? Math.round(
              (settings.mem_regeneration_total_items - settings.mem_regeneration_processed_items)
              * (settings.mem_regeneration_avg_batch_time_ms / settings.mem_regeneration_current_batch_size),
            )
          : null,
      })
    }
    catch (error) {
      console.error('Failed to get regeneration status:', error)
      res.status(500).json({
        error: 'Failed to get regeneration status',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // Get context for a message
  app.post('/api/context', authenticateApiKey, async (req, res) => {
    try {
      const { message } = req.body
      if (!message) {
        return res.status(400).json({ error: 'message is required' })
      }

      // Store the message first so it's included in context building
      await memoryService.ingestMessage({
        content: message,
        platform: 'web',
      })

      // Build context using ContextBuilder
      const context = await memoryService.buildQueryContext(message)

      // console.log('========== Context ================================')
      // console.log('Context:', JSON.stringify(context, null, 2))
      // console.log('===================================================')

      res.json(context)
    }
    catch (error) {
      console.error('Failed to build context:', error)
      res.status(500).json({
        error: 'Failed to build context',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  // Get paginated conversation history
  app.get('/api/conversations', authenticateApiKey, async (req, res) => {
    try {
      const db = useDrizzle()
      const limit = Number.parseInt(req.query.limit as string) || 10
      const before = Number.parseInt(req.query.before as string) || Date.now() // timestamp for pagination

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

      res.json({
        messages: conversation.reverse(), // revered to get chat-style order
        hasMore: conversation.length === limit,
        nextCursor: earliestTimestamp,
      })
    }
    catch (error) {
      console.error('Failed to fetch conversation history:', error)
      res.status(500).json({
        error: 'Failed to fetch conversation history',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  })

  return app
}
