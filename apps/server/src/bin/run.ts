#!/usr/bin/env node

import process from 'node:process'

import { pathToFileURL } from 'node:url'

import { runApiServer } from '../app'
import { handleCacheSyncMessage, runBillingEventsConsumer } from './run-billing-events-consumer'
import { runOutboxDispatcher } from './run-outbox-dispatcher'

const serverRoles = ['api', 'cache-sync-consumer', 'outbox-dispatcher'] as const

type ServerRole = typeof serverRoles[number]

export function getServerCliHelpText(): string {
  return [
    'Usage: server <role>',
    '',
    'Roles:',
    '  api                 Start the HTTP/WebSocket API process',
    '  cache-sync-consumer Start the cache-sync Redis Streams consumer',
    '  outbox-dispatcher   Publish DB outbox events to Redis Streams',
  ].join('\n')
}

export function parseServerRole(args: string[]): ServerRole | null {
  const role = args[0]
  if (!role) {
    return null
  }

  return serverRoles.includes(role as ServerRole) ? role as ServerRole : null
}

async function runServerRole(role: ServerRole): Promise<void> {
  switch (role) {
    case 'api':
      await runApiServer()
      return
    case 'cache-sync-consumer':
      await runBillingEventsConsumer({
        group: 'cache-sync',
        loggerName: 'cache-sync-consumer',
        handleMessage: handleCacheSyncMessage,
      })
      return
    case 'outbox-dispatcher':
      await runOutboxDispatcher()
  }
}

async function main(): Promise<void> {
  const role = parseServerRole(process.argv.slice(2))
  if (!role) {
    process.stdout.write(`${getServerCliHelpText()}\n`)
    process.exitCode = 1
    return
  }

  await runServerRole(role)
}

function isExecutedAsMainModule(): boolean {
  const entryFile = process.argv[1]
  if (!entryFile) {
    return false
  }

  return import.meta.url === pathToFileURL(entryFile).href
}

if (isExecutedAsMainModule()) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
}
