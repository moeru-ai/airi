import type { SessionStore } from '@proj-airi/visual-chat-runtime'

import { generateToken } from '@proj-airi/visual-chat-livekit'
import { createGatewayLogger } from '@proj-airi/visual-chat-observability'
import { createError, createRouter, defineEventHandler, getRouterParam, readBody } from 'h3'

import { requireGatewayAccess, requireSessionAccess } from '../auth'
import { gatewayEnv } from '../gateway-env'

const log = createGatewayLogger()

export function createRoomRoutes(store: SessionStore) {
  const router = createRouter()

  router.post('/api/rooms/:roomName/token', defineEventHandler(async (event) => {
    const roomName = getRouterParam(event, 'roomName')!
    const body = await readBody(event) as {
      name?: string
      identity?: string
    }

    const orchestrator = store.getByRoom(roomName)
    if (!orchestrator) {
      log.withTag('rooms').warn(`Token requested for unknown room: ${roomName}`)
      throw createError({ statusCode: 404, statusMessage: 'Room not found. Create a session first.' })
    }

    requireSessionAccess(event, orchestrator.sessionId)

    const apiKey = gatewayEnv.livekitApiKey
    const apiSecret = gatewayEnv.livekitApiSecret

    const token = await generateToken({
      apiKey,
      apiSecret,
      roomName,
      participantName: body.name ?? 'user',
      participantIdentity: body.identity ?? `user_${Date.now()}`,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    })

    return {
      token,
      roomName,
      sessionId: orchestrator.sessionId,
    }
  }))

  router.get('/api/rooms', defineEventHandler((event) => {
    requireGatewayAccess(event)
    return store.getAll().map(o => ({
      roomName: o.roomName,
      sessionId: o.sessionId,
      mode: o.mode,
      state: o.state,
    }))
  }))

  return router
}
