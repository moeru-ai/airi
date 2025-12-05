import process from 'node:process'

import { initLogger, LoggerFormat, LoggerLevel, useLogger } from '@guiiai/logg'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { createAuth } from './services/auth'
import { createDrizzle } from './services/db'
import { parseEnv } from './services/env'

function createApp() {
  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)

  const app = new Hono()

  app.use(
    '/api/auth/*', // or replace with "*" to enable cors for all routes
    cors({
      origin: ['http://localhost:5173'], // replace with your origin
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['POST', 'GET', 'OPTIONS'],
      exposeHeaders: ['Content-Length'],
      maxAge: 600,
      credentials: true,
    }),
  )

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

  app.on(['POST', 'GET'], '/api/auth/*', (c) => {
    return auth.handler(c.req.raw)
  })

  logger.withFields({ port: 3000 }).log('Server started')

  return app
}

serve(createApp())
