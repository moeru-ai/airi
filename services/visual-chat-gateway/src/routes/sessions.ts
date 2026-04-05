import type { SessionAccess, SessionContext, SessionRecord } from '@proj-airi/visual-chat-protocol'
import type { SessionStore } from '@proj-airi/visual-chat-runtime'

import { SessionOrchestrator } from '@proj-airi/visual-chat-runtime'
import { generateRoomName, normalizeVisualChatSessionId } from '@proj-airi/visual-chat-shared'
import { deleteSessionData } from '@proj-airi/visual-chat-storage'
import { createError, createRouter, defineEventHandler, getRouterParam, readBody } from 'h3'

import { createSessionAccessToken, requireGatewayAccess, requireSessionAccess } from '../auth'

export type BroadcastFn = (sessionId: string, event: string, data: unknown) => void

interface SessionRoutesOptions {
  onSessionCreated?: (sessionId: string, roomName: string) => void | Promise<void>
  onSessionDeleted?: (sessionId: string) => void
  getSessionMessages?: (sessionId: string) => Promise<unknown[]> | unknown[]
  getSessionRecord?: (sessionId: string) => Promise<SessionRecord | null> | SessionRecord | null
  listSessionRecords?: () => Promise<SessionRecord[]> | SessionRecord[]
  restoreSession?: (sessionId: string) => Promise<SessionContext> | SessionContext
}

export function createSessionRoutes(store: SessionStore, broadcast: BroadcastFn, options: SessionRoutesOptions = {}) {
  const router = createRouter()

  function createSessionAccessPayload(orchestrator: SessionOrchestrator): SessionAccess {
    return {
      session: orchestrator.getContext(),
      sessionToken: createSessionAccessToken(orchestrator.sessionId),
    }
  }

  router.post('/api/sessions', defineEventHandler(async (event) => {
    requireGatewayAccess(event)

    const roomName = generateRoomName()
    const orchestrator = new SessionOrchestrator(roomName)

    orchestrator.onEvent((evt, data) => {
      broadcast(orchestrator.sessionId, evt, data)
    })

    store.add(orchestrator)
    await options.onSessionCreated?.(orchestrator.sessionId, roomName)

    broadcast(orchestrator.sessionId, 'session:started', orchestrator.getContext())

    return createSessionAccessPayload(orchestrator)
  }))

  router.post('/api/sessions/:sessionId/access', defineEventHandler((event) => {
    requireGatewayAccess(event)
    const sessionId = normalizeVisualChatSessionId(getRouterParam(event, 'sessionId')!)
    const orchestrator = store.getBySessionId(sessionId)
    if (!orchestrator)
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })

    return createSessionAccessPayload(orchestrator)
  }))

  router.get('/api/sessions', defineEventHandler((event) => {
    requireGatewayAccess(event)
    return store.getAll().map(o => o.getContext())
  }))

  router.get('/api/sessions/:sessionId', defineEventHandler((event) => {
    const sessionId = requireSessionAccess(event, getRouterParam(event, 'sessionId')!)
    const orchestrator = store.getBySessionId(sessionId)
    if (!orchestrator)
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })

    return orchestrator.getContext()
  }))

  router.get('/api/sessions/:sessionId/messages', defineEventHandler(async (event) => {
    const sessionId = requireSessionAccess(event, getRouterParam(event, 'sessionId')!)
    return {
      messages: await options.getSessionMessages?.(sessionId) ?? [],
    }
  }))

  router.get('/api/sessions/:sessionId/record', defineEventHandler(async (event) => {
    const sessionId = requireSessionAccess(event, getRouterParam(event, 'sessionId')!)
    const record = await options.getSessionRecord?.(sessionId)
    if (!record)
      throw createError({ statusCode: 404, statusMessage: 'Session record not found' })
    return record
  }))

  router.get('/api/session-records', defineEventHandler(async (event) => {
    requireGatewayAccess(event)
    return {
      records: await options.listSessionRecords?.() ?? [],
    }
  }))

  router.post('/api/session-records/:sessionId/restore', defineEventHandler(async (event) => {
    requireGatewayAccess(event)
    const sessionId = normalizeVisualChatSessionId(getRouterParam(event, 'sessionId')!)
    const restored = await options.restoreSession?.(sessionId)
    if (!restored)
      throw createError({ statusCode: 404, statusMessage: 'Session record not found' })

    return {
      session: restored,
      sessionToken: createSessionAccessToken(sessionId),
    } satisfies SessionAccess
  }))

  router.delete('/api/sessions/:sessionId/record', defineEventHandler(async (event) => {
    const sessionId = requireSessionAccess(event, getRouterParam(event, 'sessionId')!)
    await deleteSessionData(sessionId)
    return { success: true }
  }))

  router.delete('/api/sessions/:sessionId', defineEventHandler((event) => {
    const sessionId = requireSessionAccess(event, getRouterParam(event, 'sessionId')!)
    const orchestrator = store.getBySessionId(sessionId)
    if (orchestrator) {
      broadcast(sessionId, 'session:ended', { sessionId })
    }
    options.onSessionDeleted?.(sessionId)
    store.remove(sessionId)
    return { ok: true }
  }))

  router.post('/api/sessions/:sessionId/switch-source', defineEventHandler(async (event) => {
    const sessionId = requireSessionAccess(event, getRouterParam(event, 'sessionId')!)
    const body = await readBody(event) as {
      sourceId?: string
      sourceType?: string
    }
    const orchestrator = store.getBySessionId(sessionId)
    if (!orchestrator)
      throw createError({ statusCode: 404, statusMessage: 'Session not found' })

    const source = body.sourceId ?? body.sourceType
    if (!source)
      throw createError({ statusCode: 400, statusMessage: 'Missing sourceId or sourceType' })

    orchestrator.switchSource(source)
    return orchestrator.getContext()
  }))

  return router
}
