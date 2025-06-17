import process from 'node:process'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'

import { startTelegramBot } from './bots/telegram'
import { initDb } from './db'

import 'dotenv/config'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Debug)

async function main() {
  await initDb()
  await Promise.all([
    startTelegramBot(),
  ])
}

process.on('unhandledRejection', (err) => {
  const log = useLogg('UnhandledRejection').useGlobalConfig()
  log
    .withError(err)
    .withField('cause', (err as any).cause)
    .error('Unhandled rejection')
})

main().catch(console.error)
