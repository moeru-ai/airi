import { createLiveKitLogger } from '@proj-airi/visual-chat-observability'
import { WebhookReceiver } from 'livekit-server-sdk'

const log = createLiveKitLogger()

export interface LiveKitEvent {
  event: string
  room?: { name: string, sid: string }
  participant?: { identity: string, sid: string }
  track?: { sid: string, type: string }
  createdAt: number
}

export type WebhookEventHandler = (event: LiveKitEvent) => void | Promise<void>

export function createWebhookHandler(
  apiKey: string,
  apiSecret: string,
  onEvent: WebhookEventHandler,
) {
  const receiver = new WebhookReceiver(apiKey, apiSecret)

  return async (body: string, authHeader: string) => {
    try {
      const event = await receiver.receive(body, authHeader)

      const parsed: LiveKitEvent = {
        event: event.event ?? 'unknown',
        room: event.room ? { name: event.room.name, sid: event.room.sid } : undefined,
        participant: event.participant
          ? { identity: event.participant.identity, sid: event.participant.sid }
          : undefined,
        track: event.track
          ? { sid: event.track.sid, type: event.track.type ?? 'unknown' }
          : undefined,
        createdAt: event.createdAt
          ? Math.floor(Number(event.createdAt) * 1000)
          : Date.now(),
      }

      log.withTag('webhook').log(`Event: ${parsed.event} room=${parsed.room?.name}`)
      await onEvent(parsed)
    }
    catch (err) {
      log.withTag('webhook').error(`Webhook verification failed: ${err}`)
      throw err
    }
  }
}
