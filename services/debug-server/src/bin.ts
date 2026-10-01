import process from 'node:process'

import { initLogger, useLogg } from '@guiiai/logg'

import { loadConfig } from './config'
import { startDebugServer } from './runtime'

initLogger()
const log = useLogg('debug-server').useGlobalConfig()

async function main(): Promise<void> {
  const config = loadConfig()
  const server = await startDebugServer(config)
  if (config.tokenGenerated)
    process.stderr.write(`[debug-server] Generated Bearer token: ${config.token}\n`)

  let stopping = false
  async function stop(signal: string): Promise<void> {
    if (stopping)
      return
    stopping = true
    log.withField('signal', signal).log('Closing the server')
    await server.stop()
  }

  process.once('SIGINT', () => void stop('SIGINT'))
  process.once('SIGTERM', () => void stop('SIGTERM'))
}

main().catch((error) => {
  log.withError(error).error('Startup failed')
  process.exitCode = 1
})
