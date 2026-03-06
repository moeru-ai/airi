import type { MatrixClient, MatrixEvent } from 'matrix-js-sdk'

import type { BotContext, ChatContext } from '../../types.js'

import { env } from 'node:process'

import { useLogg } from '@guiiai/logg'
import { createClient } from 'matrix-js-sdk'

function createBotContext(client: MatrixClient): BotContext {
  return {
    client,
    logger: useLogg('MatrixBot').useGlobalConfig(),
    processedIds: new Set(),
    messageQueue: [],
    unreadMessages: {},
    lastInteractedNChatIds: [],
    processing: false,
    chats: new Map<string, ChatContext>(),
  }
}

function ensureChatContext(botCtx: BotContext, roomId: string): ChatContext {
  if (botCtx.chats.has(roomId)) {
    return botCtx.chats.get(roomId)!
  }

  const newChatContext: ChatContext = {
    roomId,
    messages: [],
    actions: [],
  }

  botCtx.chats.set(roomId, newChatContext)
  return newChatContext
}

async function onMessageArrival(botCtx: BotContext, chatCtx: ChatContext) {
  if (botCtx.processing)
    return
  botCtx.processing = true

  try {
    while (botCtx.messageQueue.length > 0) {
      const nextMsg = botCtx.messageQueue[0]

      if (nextMsg.status === 'pending') {
        nextMsg.status = 'ready'
      }

      if (nextMsg.status === 'ready') {
        const roomId = nextMsg.event.getRoomId()
        if (!roomId)
          continue

        let unreadMessagesForThisChat = botCtx.unreadMessages[roomId] || []

        unreadMessagesForThisChat.push(nextMsg.event)

        if (unreadMessagesForThisChat.length > 100) {
          unreadMessagesForThisChat = unreadMessagesForThisChat.slice(-100)
        }

        botCtx.unreadMessages[roomId] = unreadMessagesForThisChat

        botCtx.logger.withField('roomId', roomId).log('message queue processed, ready for AIRI loop')

        botCtx.messageQueue.shift()
      }
    }
  }
  catch (err) {
    botCtx.logger.withError(err).log('Error in message arrival processing')
  }
  finally {
    botCtx.processing = false
  }
}

export async function startMatrixBot() {
  const log = useLogg('Bot').useGlobalConfig()

  if (!env.MATRIX_HOMESERVER_URL || !env.MATRIX_ACCESS_TOKEN || !env.MATRIX_USER_ID) {
    log.error('Missing Matrix credentials (MATRIX_HOMESERVER_URL, MATRIX_ACCESS_TOKEN, MATRIX_USER_ID)')
    return
  }

  const client = createClient({
    baseUrl: env.MATRIX_HOMESERVER_URL,
    accessToken: env.MATRIX_ACCESS_TOKEN,
    userId: env.MATRIX_USER_ID,
  })

  const botCtx = createBotContext(client)

  client.on('Room.timeline', (event: MatrixEvent, room, toStartOfTimeline) => {
    if (toStartOfTimeline)
      return
    if (event.getType() !== 'm.room.message')
      return

    const roomId = event.getRoomId()
    if (!roomId)
      return

    const eventId = event.getId()
    if (!eventId || botCtx.processedIds.has(eventId))
      return

    botCtx.processedIds.add(eventId)

    if (event.getSender() === env.MATRIX_USER_ID)
      return

    botCtx.messageQueue.push({
      event,
      status: 'pending',
    })

    const chatCtx = ensureChatContext(botCtx, roomId)
    onMessageArrival(botCtx, chatCtx)
  })

  client.on('RoomMember.membership', (event: MatrixEvent, member) => {
    if (member.membership === 'invite' && member.userId === env.MATRIX_USER_ID) {
      log.withField('roomId', member.roomId).log('Auto-joining room')
      client.joinRoom(member.roomId).catch((err) => {
        log.withError(err).log('Failed to join room')
      })
    }
  })

  log.log('Starting Matrix client sync...')
  await client.startClient({ initialSyncLimit: 10 })
  log.log('Matrix bot initialized.')
}
