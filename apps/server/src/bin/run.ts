#!/usr/bin/env node

import process from 'node:process'

import { pathToFileURL } from 'node:url'

import { errorMessageFrom } from '@moeru/std'
import { cac } from 'cac'

import { runApiServer } from '../app'
import { handleCacheSyncMessage, runBillingEventsConsumer } from './run-billing-events-consumer'
import { runOutboxDispatcher } from './run-outbox-dispatcher'

const serverRoles = ['api', 'cache-sync-consumer', 'outbox-dispatcher'] as const

type ServerRole = typeof serverRoles[number]

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

export function createServerCli() {
  const cli = cac('server')

  cli
    .usage('<role>')
    .command('api', 'Start the HTTP/WebSocket API process')
    .action(() => runServerRole('api'))

  cli
    .command('cache-sync-consumer', 'Start the cache-sync Redis Streams consumer')
    .action(() => runServerRole('cache-sync-consumer'))

  cli
    .command('outbox-dispatcher', 'Publish DB outbox events to Redis Streams')
    .action(() => runServerRole('outbox-dispatcher'))

  cli.help()

  return cli
}

export function parseServerRole(args: string[]): ServerRole | null {
  const cli = createServerCli()
  cli.parse(['node', 'server', ...args], { run: false })

  const role = cli.matchedCommandName
  if (!role) {
    return null
  }

  return serverRoles.includes(role as ServerRole) ? role as ServerRole : null
}

async function main(): Promise<void> {
  const cli = createServerCli()
  cli.parse(process.argv, { run: false })

  if (!cli.matchedCommand) {
    cli.outputHelp()
    process.exitCode = 1
    return
  }

  await cli.runMatchedCommand()
}

function isExecutedAsMainModule(): boolean {
  const entryFile = process.argv[1]
  if (!entryFile) {
    return false
  }

  return import.meta.url === pathToFileURL(entryFile).href
}

if (isExecutedAsMainModule()) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${errorMessageFrom(error) ?? 'Unknown error'}\n`)
    process.exit(1)
  })
}
