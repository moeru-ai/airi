#!/usr/bin/env node

import process from 'node:process'

import { pathToFileURL } from 'node:url'

import { cac } from 'cac'

import { runApiServer } from '../app'
import { errorMessageFromUnknown } from '../utils/error-message'

export function createServerCli() {
  const cli = cac('server')

  cli
    .usage('<role>')
    .command('api', 'Start the HTTP/WebSocket API process')
    .action(() => runApiServer())

  cli.help()

  return cli
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
