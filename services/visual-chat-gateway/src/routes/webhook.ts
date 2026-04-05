import type { LiveKitEvent } from '@proj-airi/visual-chat-livekit'
import type { SessionStore } from '@proj-airi/visual-chat-runtime'

import { createWebhookHandler } from '@proj-airi/visual-chat-livekit'
import { createGatewayLogger } from '@proj-airi/visual-chat-observability'
import { createError, createRouter, defineEventHandler, getHeader, readRawBody } from 'h3'

import { gatewayEnv } from '../gateway-env'

const log = createGatewayLogger()

export type BroadcastFn = (sessionId: string, event: string, data: unknown) => void

export function createWebhookRoutes(store: SessionStore, broadcast: BroadcastFn) {
  const router = createRouter()

  function handleEvent(event: LiveKitEvent) {
    const roomName = event.room?.name
    if (!roomName)
      return

    const orchestrator = store.getByRoom(roomName)
    if (!orchestrator)
      return

    switch (event.event) {
      case 'track_published': {
        if (event.participant && event.track) {
          const sourceType = inferSourceType(event.track.type, event.participant.identity)
          orchestrator.registerSource(event.participant.identity, event.track.sid, sourceType)
          broadcast(orchestrator.sessionId, 'source:registered', orchestrator.getContext())
          log.withTag('webhook').log(`Source registered via webhook: ${sourceType} from ${event.participant.identity}`)
        }
        break
      }
      case 'track_unpublished': {
        if (event.track) {
          const registry = orchestrator.getRegistry()
          const source = registry.findByTrackSid(event.track.sid)
          if (source) {
            orchestrator.unregisterSource(source.sourceId)
            broadcast(orchestrator.sessionId, 'source:unregistered', orchestrator.getContext())
          }
        }
        break
      }
      case 'participant_joined': {
        broadcast(orchestrator.sessionId, 'room:participant:joined', {
          identity: event.participant?.identity,
        })
        break
      }
      case 'participant_left': {
        if (event.participant) {
          const registry = orchestrator.getRegistry()
          const sources = registry.findByParticipant(event.participant.identity)
          for (const source of sources) {
            orchestrator.unregisterSource(source.sourceId)
          }
          broadcast(orchestrator.sessionId, 'room:participant:left', {
            identity: event.participant.identity,
          })
        }
        break
      }
    }
  }

  router.post('/api/livekit/webhook', defineEventHandler(async (event) => {
    const apiKey = gatewayEnv.livekitApiKey
    const apiSecret = gatewayEnv.livekitApiSecret

    const body = await readRawBody(event, 'utf8')
    const authHeader = getHeader(event, 'authorization') ?? ''

    if (!body)
      throw createError({ statusCode: 400, statusMessage: 'Missing body' })

    const handler = createWebhookHandler(apiKey, apiSecret, handleEvent)
    await handler(body, authHeader)
    return { ok: true }
  }))

  return router
}

function inferSourceType(trackType: string, identity: string): 'phone-camera' | 'laptop-camera' | 'screen-share' | 'phone-mic' | 'laptop-mic' {
  if (trackType === 'TRACK_TYPE_VIDEO' || trackType === 'video') {
    if (identity.startsWith('phone') || identity.includes('mobile'))
      return 'phone-camera'
    if (identity.includes('screen'))
      return 'screen-share'
    return 'laptop-camera'
  }

  if (identity.startsWith('phone') || identity.includes('mobile'))
    return 'phone-mic'
  return 'laptop-mic'
}
