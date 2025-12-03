#!/usr/bin/env tsx

import { env } from 'node:process'

import { plugin as ws } from 'crossws/server'
import { serve } from 'h3'

import { app } from '..'

serve(app, {
  // TODO: fix types
  // @ts-expect-error - the .crossws property wasn't extended in types
  plugins: [ws({ resolve: async req => (await app.fetch(req)).crossws })],
  port: env.PORT ? Number(env.PORT) : 6121,
})
