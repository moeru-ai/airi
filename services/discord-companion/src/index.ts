import process from 'node:process'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'

import { loadCompanionConfigFromEnv } from './config'
import { createCompanionService } from './service'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)

const log = useLogg('discord-companion').useGlobalConfig()

async function main() {
  const config = loadCompanionConfigFromEnv()
  const service = createCompanionService(config)

  await service.start()

  const shutdown = async (signal: string) => {
    log.withField('signal', signal).log('Shutting down...')
    await service.stop()
    process.exit(0)
  }

  process.on('SIGINT', () => {
    void shutdown('SIGINT')
  })
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM')
  })
}

process.on('unhandledRejection', (err) => {
  log
    .withError(err)
    .withField('message', errorMessageFrom(err) ?? 'unknown error')
    .error('Unhandled rejection')
})

main().catch((error) => {
  log
    .withError(error)
    .withField('message', errorMessageFrom(error) ?? 'unknown error')
    .error('discord-companion service crashed')
  process.exit(1)
})
