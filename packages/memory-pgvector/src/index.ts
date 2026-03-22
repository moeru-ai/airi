import process from 'node:process'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel } from '@guiiai/logg'
import { Client } from '@proj-airi/server-sdk'
import { runUntilSignal } from '@proj-airi/server-sdk/utils/node'

import { MemoryModuleService } from './service.js'
import { createDefaultMemoryConfig, MEMORY_CONFIG_SCHEMA } from './types.js'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)

const identity = {
  kind: 'plugin' as const,
  id: `memory-pgvector-${Date.now().toString(36)}`,
  plugin: {
    id: 'memory-pgvector',
    version: '0.9.0-alpha.15',
  },
  labels: {
    category: 'memory',
  },
}

async function main() {
  const defaultConfig = createDefaultMemoryConfig()

  const client = new Client({
    name: 'memory-pgvector',
    identity,
    configSchema: MEMORY_CONFIG_SCHEMA,
    possibleEvents: [
      'module:configure',
      'module:authenticated',
      'module:status',
      'module:configuration:configured',
      'module:contribute:capability:offer',
      'context:update',
      'memory:upsert',
      'memory:upsert:result',
      'memory:search:request',
      'memory:search:response',
      'memory:delete',
      'memory:delete:result',
      'memory:ingest:chat-turn',
      'memory:ingest:chat-turn:result',
      'memory:stats:request',
      'memory:stats:response',
      'memory:consolidate:request',
      'memory:consolidate:result',
    ],
  })

  const service = new MemoryModuleService(client, identity)
  await service.initialize()
  await service.configure(defaultConfig)

  runUntilSignal()

  process.on('SIGINT', () => client.close())
  process.on('SIGTERM', () => client.close())
}

void main()
