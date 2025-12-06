import process from 'node:process'

import { initLogger, LoggerFormat, LoggerLevel, useLogger } from '@guiiai/logg'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'

import { createAuth } from './services/auth'
import { createDrizzle } from './services/db'
import { parseEnv } from './services/env'

function createApp() {
  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)

  const app = new Hono<{
    Variables: {
      user: typeof auth.$Infer.Session.user | null
      session: typeof auth.$Infer.Session.session | null
    }
  }>()
  const env = parseEnv(process.env)

  const logger = useLogger('app').useGlobalConfig()
  const db = createDrizzle(env.DATABASE_URL)
  const auth = createAuth(db, env)

  db.execute('SELECT 1')
    .then(() => {
      logger.log('Connected to database')
    })
    .catch((err) => {
      logger.withError(err).error('Failed to connect to database')
    })

  app.use(
    '/api/auth/*', // or replace with "*" to enable cors for all routes
    cors({
      origin: ['http://localhost:5173'], // replace with your origin
      // allowHeaders: ['Content-Type', 'Authorization'],
      // allowMethods: ['POST', 'GET', 'OPTIONS'],
      // exposeHeaders: ['Content-Length'],
      // maxAge: 600,
      credentials: true,
    }),
  )

  app.use(honoLogger())

  app.use('*', async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })

    console.log('headers', c.req.raw.headers)
    if (!session) {
      c.set('user', null)
      c.set('session', null)
      await next()
      return
    }

    console.log('session', session)
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

  app.on(['POST', 'GET'], '/api/auth/*', (c) => {
    return auth.handler(c.req.raw)
  })

  logger.withFields({ port: 3000 }).log('Server started')

  return app
}

serve(createApp())
