#!/usr/bin/env tsx

import { env } from 'node:process'

import { createServer } from '../server'

const server = createServer({
  port: env.PORT ? Number.parseInt(env.PORT) : 6121,
})

server.start()
