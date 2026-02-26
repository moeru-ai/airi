import type { Env } from './services/env'
import type { HonoEnv } from './types/hono'

import process from 'node:process'

import { initLogger, LoggerFormat, LoggerLevel, useLogger } from '@guiiai/logg'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { createLoggLogger, injeca } from 'injeca'

import { sessionMiddleware } from './middlewares/auth'
import { createCharacterRoutes } from './routes/characters'
import { createChatRoutes } from './routes/chats'
import { createFluxRoutes } from './routes/flux'
import { createProviderRoutes } from './routes/providers'
import { createStripeRoutes } from './routes/stripe'
import { createV1Routes } from './routes/v1'
import { createAuth } from './services/auth'
import { createCharacterService } from './services/characters'
import { createChatService } from './services/chats'
import { createDrizzle, migrateDatabase } from './services/db'
import { parsedEnv } from './services/env'
import { createFluxService } from './services/flux'
import { createProviderService } from './services/providers'
import { ApiError, createInternalError } from './utils/error'
import { getTrustedOrigin } from './utils/origin'

type AuthService = ReturnType<typeof createAuth>
type CharacterService = ReturnType<typeof createCharacterService>
type ChatService = ReturnType<typeof createChatService>
type ProviderService = ReturnType<typeof createProviderService>
type FluxService = ReturnType<typeof createFluxService>

interface AppDeps {
  auth: AuthService
  characterService: CharacterService
  chatService: ChatService
  providerService: ProviderService
  fluxService: FluxService
  env: Env
}

function buildApp({ auth, characterService, chatService, providerService, fluxService, env }: AppDeps) {
  const logger = useLogger('app').useGlobalConfig()

  return new Hono<HonoEnv>()
    .use(
      '/api/*',
      cors({
        origin: origin => getTrustedOrigin(origin),
        credentials: true,
      }),
    )
    .use(honoLogger())
    .use('*', sessionMiddleware(auth))
    .onError((err, c) => {
      if (err instanceof ApiError) {
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
     * V1 routes for official provider.
     */
    .route('/v1', createV1Routes(fluxService, env))

    /**
     * Flux routes.
     */
    .route('/api/flux', createFluxRoutes(fluxService))

    /**
     * Stripe routes.
     */
    .route('/api/stripe', createStripeRoutes(fluxService, env))
}

export type AppType = ReturnType<typeof buildApp>

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

  const fluxService = injeca.provide('services:flux', {
    dependsOn: { db },
    build: ({ dependsOn }) => createFluxService(dependsOn.db),
  })

  await injeca.start()
  const resolved = await injeca.resolve({ auth, characterService, chatService, providerService, fluxService, env: parsedEnv })
  const app = buildApp({
    auth: resolved.auth,
    characterService: resolved.characterService,
    chatService: resolved.chatService,
    providerService: resolved.providerService,
    fluxService: resolved.fluxService,
    env: resolved.env,
  })

  logger.withFields({ port: 3000 }).log('Server started')

  return app
}

// eslint-disable-next-line antfu/no-top-level-await
serve(await createApp())

function handleError(error: unknown, type: string) {
  useLogger().withError(error).error(type)
}

process.on('uncaughtException', error => handleError(error, 'Uncaught exception'))
process.on('unhandledRejection', error => handleError(error, 'Unhandled rejection'))
