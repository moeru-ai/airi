import process, { env } from 'node:process'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'

import { createBotContext, ensureChatContext, onMessageArrival, startPeriodicLoop } from './bot'
import { SatoriClient } from './client/satori-client'
import { initDb } from './db'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Debug)

async function main() {
  const log = useLogg('Main').useGlobalConfig()

  // Initialize database
  await initDb()
  log.log('Database initialized')

  // Create Satori client
  const satoriClient = new SatoriClient({
    url: env.SATORI_WS_URL || 'ws://localhost:5140/satori/v1/events',
    token: env.SATORI_TOKEN,
    apiBaseUrl: env.SATORI_API_BASE_URL,
  })

  // Create bot context
  const botContext = createBotContext(log)

  // Set up event handlers
  satoriClient.onReady((ready) => {
    log.log('Satori client ready:', ready)
    log.log(`Connected to ${ready.logins.length} platform(s)`)

    for (const login of ready.logins) {
      log.log(`- ${login.platform} (${login.self_id}): ${login.status}`)
    }
  })

  // Handle message-created events
  satoriClient.on('message-created', async (event) => {
    const message = event.message
    if (!message) {
      return
    }

    // Skip bot's own messages
    if (message.user?.id === event.self_id) {
      return
    }

    // Use event.channel.id as primary source, fallback to message.channel.id
    const channelId = event.channel?.id || message.channel?.id || 'unknown'

    const messageId = `${channelId}-${message.id}`
    if (botContext.processedIds.has(messageId)) {
      return
    }

    botContext.processedIds.add(messageId)
    log.log(`Received message from ${message.user?.name || message.user?.id} in channel ${channelId}: ${message.content}`)

    // Add to message queue
    botContext.messageQueue.push({
      message,
      status: 'ready',
    })

    // Get or create chat context
    const chatCtx = await ensureChatContext(botContext, channelId)

    // Set platform and selfId if not set
    if (!chatCtx.platform) {
      chatCtx.platform = event.platform
    }
    if (!chatCtx.selfId) {
      chatCtx.selfId = event.self_id
    }

    // Process message
    await onMessageArrival(botContext, satoriClient, chatCtx)
  })

  // Connect to Satori server
  await satoriClient.connect()
  log.log('Connected to Satori server')

  // Start periodic loop
  startPeriodicLoop(botContext, satoriClient)
  log.log('Periodic loop started')
}

process.on('unhandledRejection', (err) => {
  const log = useLogg('UnhandledRejection').useGlobalConfig()
  log
    .withError(err as Error)
    .withField('cause', (err as any).cause)
    .error('Unhandled rejection')
})

main().catch(console.error)
