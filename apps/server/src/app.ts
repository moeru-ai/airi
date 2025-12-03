import { env } from 'node:process'

import { initLogger, LoggerFormat, LoggerLevel, useLogger } from '@guiiai/logg'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'

import { createAuth } from './services/auth'
import { createDrizzle } from './services/db'

(async () => {
  const app = new Hono()

  initLogger(LoggerLevel.Debug, LoggerFormat.Pretty)
  const logger = useLogger('app').useGlobalConfig()
  const db = createDrizzle(env.DATABASE_URL!)
  const auth = createAuth(db)

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

  serve(app)

  logger.withFields({ port: 3000 }).log('Server started')
})()
