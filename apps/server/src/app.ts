import process, { exit } from 'node:process'

import { initLogger, LoggerFormat, LoggerLevel, useLogger } from '@guiiai/logg'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { createLoggLogger, injeca } from 'injeca'

import { createCharacterRoutes } from './routes/characters'
import { createAuth } from './services/auth'
import { createCharacterService } from './services/characters'
import { createDrizzle } from './services/db'
import { parsedEnv } from './services/env'
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

  const app = new Hono<{
    Variables: {
      user: typeof authInstance.$Infer.Session.user | null
      session: typeof authInstance.$Infer.Session.session | null
    }
  }>()

  app.use(
    '/api/auth/*',
    cors({
      origin(origin: string) {
        return getTrustedOrigin(origin)
      },
      credentials: true,
    }),
  )

  app.use(honoLogger())

  app.use('*', async (c, next) => {
    const session = await authInstance.api.getSession({ headers: c.req.raw.headers })

    if (!session) {
      c.set('user', null)
      c.set('session', null)
      await next()
      return
    }

    c.set('user', session.user)
    c.set('session', session.session)

    await next()
  })

  app.get('/session', (c) => {
    const session = c.get('session')
    const user = c.get('user')

    if (!user)
      return c.body(null, 401)

    return c.json({
      session,
      user,
    })
  })

  app.route('/api/characters', createCharacterRoutes(resolved.characterService, authInstance))

  // NOTICE: required by better-auth
  app.on(['POST', 'GET'], '/api/auth/*', (c) => {
    return authInstance.handler(c.req.raw)
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
