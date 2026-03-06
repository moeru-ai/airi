import process, { env } from 'node:process'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'

import { MatrixAdapter } from './adapters/airi-adapter.js'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)

async function main() {
  const adapter = new MatrixAdapter({
    homeserverUrl: env.MATRIX_HOMESERVER_URL || '',
    accessToken: env.MATRIX_ACCESS_TOKEN || '',
    userId: env.MATRIX_USER_ID || '',
    airiToken: env.AIRI_TOKEN || 'abcd',
    airiUrl: env.AIRI_URL || 'ws://localhost:6121/ws',
  })

  await adapter.start()

  async function gracefulShutdown(signal: string) {
    const log = useLogg('Bot').useGlobalConfig()
    log.log(`Received ${signal}, shutting down...`)
    await adapter.stop()
    process.exit(0)
  }

  process.on('SIGINT', async () => await gracefulShutdown('SIGINT'))
  process.on('SIGTERM', async () => await gracefulShutdown('SIGTERM'))
}

process.on('unhandledRejection', (err) => {
  const log = useLogg('UnhandledRejection').useGlobalConfig()
  log
    .withError(err)
    .withField('cause', (err as any).cause)
    .error('Unhandled rejection')
})

main().catch(console.error)
