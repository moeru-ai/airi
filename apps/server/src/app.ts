import type { HonoEnv } from './types/hono'

import process, { exit } from 'node:process'

import { initLogger, LoggerFormat, LoggerLevel, useLogger } from '@guiiai/logg'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { createLoggLogger, injeca } from 'injeca'

import { authGuard, sessionMiddleware } from './middlewares/auth'
import { createCharacterRoutes } from './routes/characters'
import { createAuth } from './services/auth'
import { createCharacterService } from './services/characters'
import { createDrizzle } from './services/db'
import { parsedEnv } from './services/env'
import { ApiError, createInternalError } from './utils/error'
import { getTrustedOrigin } from './utils/origin'

import * as schema from './schemas'

async function createApp() {
  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)
  injeca.setLogger(createLoggLogger(useLogger('injeca').useGlobalConfig()))

  const logger = useLogger('app').useGlobalConfig()

  const db = injeca.provide('services:db', {
    dependsOn: { env: parsedEnv },
    build: ({ dependsOn }) => {
      const dbInstance = createDrizzle(dependsOn.env.DATABASE_URL, schema)
      dbInstance.execute('SELECT 1')
        .then(() => logger.log('Connected to database'))
        .catch((err) => {
          logger.withError(err).error('Failed to connect to database')
          exit(1)
        })
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

  await injeca.start()
  const resolved = await injeca.resolve({ auth, characterService })
  const authInstance = resolved.auth

  const app = new Hono<HonoEnv>()

  app.use(
    '/api/*',
    cors({
      origin: origin => getTrustedOrigin(origin),
      credentials: true,
    }),
  )

  app.use(honoLogger())

  app.use('*', sessionMiddleware(authInstance))

  app.get('/session', authGuard, (c) => {
    return c.json({
      session: c.get('session'),
      user: c.get('user')!,
    })
  })

  app.on(['POST', 'GET'], '/api/auth/*', c => authInstance.handler(c.req.raw))

  app.route('/api/characters', createCharacterRoutes(resolved.characterService))

  app.onError((err, c) => {
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

  logger.withFields({ port: 3000 }).log('Server started')

  return app
}

export type AppType = Awaited<ReturnType<typeof createApp>>

// eslint-disable-next-line antfu/no-top-level-await
serve(await createApp())

function handleError(error: unknown, type: string) {
  useLogger().withError(error).error(type)
}

process.on('uncaughtException', error => handleError(error, 'Uncaught exception'))
process.on('unhandledRejection', error => handleError(error, 'Unhandled rejection'))
