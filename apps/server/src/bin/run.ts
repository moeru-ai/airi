#!/usr/bin/env node

import process from 'node:process'

import { pathToFileURL } from 'node:url'

import { cac } from 'cac'

import { runApiServer } from '../app'
import { errorMessageFromUnknown } from '../utils/error-message'
import { runBillingConsumer } from './run-billing-consumer'

const serverRoles = ['api', 'billing-consumer'] as const

type ServerRole = typeof serverRoles[number]

async function runServerRole(role: ServerRole): Promise<void> {
  switch (role) {
    case 'api':
      await runApiServer()
      return
    case 'billing-consumer':
      await runBillingConsumer()
  }
}

export function createServerCli() {
  const cli = cac('server')

  cli
    .usage('<role>')
    .command('api', 'Start the HTTP/WebSocket API process')
    .action(() => runServerRole('api'))

  cli
    .command('billing-consumer', 'Start the billing events consumer (transactions, audit, request logs)')
    .action(() => runServerRole('billing-consumer'))

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
    process.stderr.write(`${errorMessageFromUnknown(error)}\n`)
    process.exit(1)
  })
}
