import type { UpgradeWebSocket } from 'hono/ws'

import type { createAuth } from '../libs/auth'
import type { MessageService } from '../services/messages'
import type { RealtimeService } from '../services/realtime'
import type { HonoEnv } from '../types/hono'

import { useLogger } from '@guiiai/logg'
import { Hono } from 'hono'

const logger = useLogger('ws').useGlobalConfig()

export function createWsRoute(
  upgradeWebSocket: UpgradeWebSocket,
  realtimeService: RealtimeService,
  messageService: MessageService,
  auth: ReturnType<typeof createAuth>,
) {
  return new Hono<HonoEnv>()
    .get(
      '/ws',
      upgradeWebSocket(async (c) => {
        // Authenticate via session cookie
        let userId: string | null = null
        const session = await auth.api.getSession({ headers: c.req.raw.headers })
        if (session) {
          userId = session.user.id
        }

        return {
          onOpen(_event, ws) {
            if (!userId) {
              ws.close(4001, 'Unauthorized')
              return
            }

            const conn = realtimeService.addConnection(userId, ws)
            ;(ws as any).__conn = conn
            ;(ws as any).__userId = userId
          },

          async onMessage(event, ws) {
            const conn = (ws as any).__conn
            const wsUserId = (ws as any).__userId
            if (!conn || !wsUserId)
              return

            try {
              const data = JSON.parse(typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data as ArrayBuffer))

              switch (data.type) {
                case 'ping':
                  ws.send(JSON.stringify({ type: 'pong' }))
                  break

                case 'subscribe':
                  if (Array.isArray(data.chatIds)) {
                    await realtimeService.subscribe(conn, data.chatIds)
                  }
                  break

                case 'unsubscribe':
                  if (Array.isArray(data.chatIds)) {
                    await realtimeService.unsubscribe(conn, data.chatIds)
                  }
                  break

                case 'send': {
                  if (!data.chatId || !data.message)
                    break

                  const result = await messageService.pushMessages(wsUserId, data.chatId, [data.message])

                  if (result.messages.length > 0) {
                    await realtimeService.publish({
                      type: 'new_message',
                      chatId: data.chatId,
                      message: {
                        ...data.message,
                        seq: result.messages[0].seq,
                        senderId: wsUserId,
                      },
                      seq: result.messages[0].seq,
                    })
                  }

                  ws.send(JSON.stringify({
                    type: 'send_ack',
                    chatId: data.chatId,
                    messageId: data.message.id,
                    seq: result.messages[0]?.seq,
                  }))
                  break
                }

                case 'ack':
                  break

                case 'typing':
                  if (data.chatId) {
                    await realtimeService.publish({
                      type: 'typing',
                      chatId: data.chatId,
                      userId: wsUserId,
                    })
                  }
                  break
              }
            }
            catch (err) {
              logger.withError(err).warn('Failed to handle WS message')
            }
          },

          onClose(_event, ws) {
            const conn = (ws as any).__conn
            if (conn) {
              realtimeService.removeConnection(conn)
            }
          },

          onError(error) {
            logger.withError(error).warn('WS error')
          },
        }
      }),
    )
}
