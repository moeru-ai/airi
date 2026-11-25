import process from 'node:process'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'

import { PhotonAdapter } from './adapters/airi-adapter'
import { loadConfig } from './config'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)
const log = useLogg('Bot').useGlobalConfig()

async function main() {
  const adapter = new PhotonAdapter(loadConfig())
  adapter.start()

  function gracefulShutdown(signal: string) {
    log.log(`Received ${signal}, shutting down...`)
    adapter.stop()
    process.exit(0)
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
}

main().catch(err => log.withError(err).error('An error occurred'))
