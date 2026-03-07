import type { Env } from './libs/env'
import type { HonoEnv } from './types/hono'

import process from 'node:process'

import { initLogger, LoggerFormat, LoggerLevel, useLogger } from '@guiiai/logg'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { createLoggLogger, injeca } from 'injeca'

import { createAuth } from './libs/auth'
import { createDrizzle, migrateDatabase } from './libs/db'
import { parsedEnv } from './libs/env'
import { createRedis } from './libs/redis'
import { sessionMiddleware } from './middlewares/auth'
import { createCharacterRoutes } from './routes/characters'
import { createChatRoutes } from './routes/chats'
import { createConversationRoutes } from './routes/conversations'
import { createFluxRoutes } from './routes/flux'
import { createMessageRoutes } from './routes/messages'
import { createProviderRoutes } from './routes/providers'
import { createStripeRoutes } from './routes/stripe'
import { createV1CompletionsRoutes } from './routes/v1completions'
import { createWsRoute } from './routes/ws'
import { createCharacterService } from './services/characters'
import { createChatService } from './services/chats'
import { createConfigKVService } from './services/config-kv'
import { createConversationService } from './services/conversations'
import { createFluxService } from './services/flux'
import { createMessageService } from './services/messages'
import { createProviderService } from './services/providers'
import { createRealtimeService } from './services/realtime'
import { createStripeService } from './services/stripe'
import { ApiError, createInternalError } from './utils/error'
import { getTrustedOrigin } from './utils/origin'

type AuthService = ReturnType<typeof createAuth>
type CharacterService = ReturnType<typeof createCharacterService>
type ChatService = ReturnType<typeof createChatService>
type ConversationService = ReturnType<typeof createConversationService>
type MessageService = ReturnType<typeof createMessageService>
type RealtimeService = ReturnType<typeof createRealtimeService>
type ProviderService = ReturnType<typeof createProviderService>
type FluxService = ReturnType<typeof createFluxService>
type ConfigKVService = ReturnType<typeof createConfigKVService>
type StripeDBService = ReturnType<typeof createStripeService>

interface AppDeps {
  auth: AuthService
  characterService: CharacterService
  chatService: ChatService
  conversationService: ConversationService
  messageService: MessageService
  providerService: ProviderService
  fluxService: FluxService
  realtimeService: RealtimeService
  stripeService: StripeDBService
  configKV: ConfigKVService
  env: Env
}

function buildApp({ auth, characterService, chatService, conversationService, messageService, realtimeService, providerService, fluxService, stripeService, configKV, env }: AppDeps) {
  const logger = useLogger('app').useGlobalConfig()

  const app = new Hono<HonoEnv>()
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

  const honoApp = app
    .use(
      '/api/*',
      cors({
        origin: origin => getTrustedOrigin(origin),
        credentials: true,
      }),
    )
    .use(honoLogger())
    .use('*', sessionMiddleware(auth))
    .use('*', bodyLimit({ maxSize: 1024 * 1024 }))
    .onError((err, c) => {
      if (err instanceof ApiError) {
        logger.withError(err).warn('API error occurred')

        return c.json({
          error: err.errorCode,
          message: err.message,
          details: err.details,
        }, err.statusCode)
      }

      logger.withError(err).error('Unhandled error')
      const internalError = createInternalError()
      return c.json({
        error: internalError.errorCode,
        message: internalError.message,
      }, internalError.statusCode)
    })

    /**
     * Health check route.
     */
    .on('GET', '/health', c => c.json({ status: 'ok' }))

    /**
     * Auth routes are handled by the auth instance directly,
     * Powered by better-auth.
     */
    .on(['POST', 'GET'], '/api/auth/*', c => auth.handler(c.req.raw))

    /**
     * Character routes are handled by the character service.
     */
    .route('/api/characters', createCharacterRoutes(characterService))

    /**
     * Provider routes are handled by the provider service.
     */
    .route('/api/providers', createProviderRoutes(providerService))

    /**
     * Chat routes are handled by the chat service.
     */
    .route('/api/chats', createChatRoutes(chatService))

    /**
     * Conversation routes for group chat and sync.
     */
    .route('/api/conversations', createConversationRoutes(conversationService))

    /**
     * Message routes for incremental sync (push/pull).
     */
    .route('/api/conversations', createMessageRoutes(messageService))

    /**
     * V1 routes for official provider.
     */
    .route('/v1', createV1CompletionsRoutes(fluxService, configKV, env))

    /**
     * Flux routes.
     */
    .route('/api/flux', createFluxRoutes(fluxService))

    /**
     * Stripe routes.
     */
    .route('/api/stripe', createStripeRoutes(fluxService, stripeService, configKV, env))

    /**
     * WebSocket route for real-time sync.
     */
    .route('/api', createWsRoute(upgradeWebSocket, realtimeService, messageService, auth))

  return { app: honoApp, injectWebSocket }
}

export type AppType = ReturnType<typeof buildApp>['app']

async function createApp() {
  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)
  injeca.setLogger(createLoggLogger(useLogger('injeca').useGlobalConfig()))
  const logger = useLogger('app').useGlobalConfig()

  const db = injeca.provide('services:db', {
    dependsOn: { env: parsedEnv },
    build: async ({ dependsOn }) => {
      const dbInstance = createDrizzle(dependsOn.env.DATABASE_URL)
      await dbInstance.execute('SELECT 1')
      logger.log('Connected to database')
      await migrateDatabase(dbInstance)
      logger.log('Applied schema')

      return dbInstance
    },
  })

  const auth = injeca.provide('services:auth', {
    dependsOn: { db, env: parsedEnv },
    build: ({ dependsOn }) => createAuth(dependsOn.db, dependsOn.env),
  })

  const characterService = injeca.provide('services:characters', {
    dependsOn: { db },
    build: ({ dependsOn }) => createCharacterService(dependsOn.db),
  })

  const providerService = injeca.provide('services:providers', {
    dependsOn: { db },
    build: ({ dependsOn }) => createProviderService(dependsOn.db),
  })

  const chatService = injeca.provide('services:chats', {
    dependsOn: { db },
    build: ({ dependsOn }) => createChatService(dependsOn.db),
  })

  const conversationService = injeca.provide('services:conversations', {
    dependsOn: { db },
    build: ({ dependsOn }) => createConversationService(dependsOn.db),
  })

  const messageService = injeca.provide('services:messages', {
    dependsOn: { db },
    build: ({ dependsOn }) => createMessageService(dependsOn.db),
  })

  const redis = injeca.provide('services:redis', {
    dependsOn: { env: parsedEnv },
    build: async ({ dependsOn }) => {
      const redisInstance = createRedis(dependsOn.env.REDIS_URL)
      await redisInstance.connect()
      logger.log('Connected to Redis')
      return redisInstance
    },
  })

  const realtimeService = injeca.provide('services:realtime', {
    dependsOn: { redis },
    build: ({ dependsOn }) => createRealtimeService(dependsOn.redis),
  })

  const configKV = injeca.provide('services:configKV', {
    dependsOn: { redis },
    build: ({ dependsOn }) => createConfigKVService(dependsOn.redis),
  })

  const stripeService = injeca.provide('services:stripe', {
    dependsOn: { db },
    build: ({ dependsOn }) => createStripeService(dependsOn.db),
  })

  const fluxService = injeca.provide('services:flux', {
    dependsOn: { db, configKV },
    build: ({ dependsOn }) => createFluxService(dependsOn.db, dependsOn.configKV),
  })

  await injeca.start()
  const resolved = await injeca.resolve({ auth, characterService, chatService, conversationService, messageService, realtimeService, providerService, fluxService, stripeService, configKV, env: parsedEnv })
  const { app, injectWebSocket } = buildApp({
    auth: resolved.auth,
    characterService: resolved.characterService,
    chatService: resolved.chatService,
    conversationService: resolved.conversationService,
    messageService: resolved.messageService,
    realtimeService: resolved.realtimeService,
    providerService: resolved.providerService,
    fluxService: resolved.fluxService,
    stripeService: resolved.stripeService,
    configKV: resolved.configKV,
    env: resolved.env,
  })

  logger.withFields({ port: 3000 }).log('Server started')

  return { app, injectWebSocket }
}

// eslint-disable-next-line antfu/no-top-level-await
const { app, injectWebSocket } = await createApp()
const server = serve({ fetch: app.fetch, port: 3000 })
injectWebSocket(server)

function handleError(error: unknown, type: string) {
  useLogger().withError(error).error(type)
}

process.on('uncaughtException', error => handleError(error, 'Uncaught exception'))
process.on('unhandledRejection', error => handleError(error, 'Unhandled rejection'))
