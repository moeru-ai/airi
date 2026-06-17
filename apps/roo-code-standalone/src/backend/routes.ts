import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { nanoid } from 'nanoid'

import {
  getState,
  setState,
  patchState,
  createInitialStateFrom,
  listTasks,
  getTask,
  getTaskCount,
  upsertTask,
  deleteTask,
  clearTasks,
} from './state.js'
import type { HistoryItem } from '@roo-code/types'

/**
 * REST API routes for the standalone backend.
 *
 * These replace the VSCode extension host's message-based state sync.
 * The webview-ui calls these instead of postMessage({ type: "..." }).
 */
export const router: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------

  fastify.get('/state', async (_req, reply) => {
    return reply.send(getState())
  })

  fastify.post('/state', async (req, reply) => {
    const body = req.body as Record<string, unknown>
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return reply.code(400).send({ error: 'invalid body' })
    }
    const updated = patchState(body)
    return reply.send(updated)
  })

  fastify.post('/state/reset', async (_req, reply) => {
    clearTasks()
    const fresh = setState(createInitialStateFrom(getState()))
    return reply.send(fresh)
  })

  // ------------------------------------------------------------------
  // Tasks
  // ------------------------------------------------------------------

  fastify.get('/tasks', async (_req, reply) => {
    return reply.send(listTasks())
  })

  fastify.get('/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const task = getTask(id)
    if (!task) return reply.code(404).send({ error: 'not found' })
    return reply.send(task)
  })

  fastify.post('/tasks', async (req, reply) => {
    const body = req.body as { text?: string; mode?: string } | undefined
    if (!body?.text) return reply.code(400).send({ error: 'text required' })

    const id = nanoid()
    const item: HistoryItem = {
      id,
      ts: Date.now(),
      task: body.text,
      mode: body.mode ?? 'vibe',
      tokensIn: 0,
      tokensOut: 0,
      cacheWrites: 0,
      cacheReads: 0,
      totalCost: 0,
      number: getTaskCount() + 1,
    }
    upsertTask(item)
    return reply.code(201).send(item)
  })

  fastify.delete('/tasks/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    deleteTask(id)
    return reply.code(204).send()
  })

  // ------------------------------------------------------------------
  // Filesystem (Phase 2 placeholder)
  // ------------------------------------------------------------------

  fastify.get('/fs/workspace', async (_req, reply) => {
    return reply.send({ cwd: process.cwd() })
  })

  // ------------------------------------------------------------------
  // Providers
  // ------------------------------------------------------------------

  fastify.get('/providers', async (_req, reply) => {
    // The webview-ui ships with 27+ providers and knows their names.
    // This endpoint just confirms which ones the backend can proxy (future).
    return reply.send({
      providers: ['openrouter', 'openai', 'anthropic', 'gemini', 'ollama', 'lmstudio'],
    })
  })
}
