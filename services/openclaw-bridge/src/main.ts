import process from 'node:process'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'

import { OpenClawBridgeAdapter } from './openclaw-bridge-adapter'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)

const logger = useLogg('openclaw-bridge-main').useGlobalConfig()

async function main() {
  const adapter = new OpenClawBridgeAdapter({
    airiToken: process.env.AIRI_TOKEN,
    airiUrl: process.env.AIRI_URL,
    apiKey: process.env.OPENCLAW_API_KEY,
    baseUrl: process.env.OPENCLAW_BASE_URL ?? 'http://localhost:8123',
    model: process.env.OPENCLAW_MODEL ?? 'openclaw-default',
    requestTimeoutMs: process.env.OPENCLAW_REQUEST_TIMEOUT_MS
      ? Number(process.env.OPENCLAW_REQUEST_TIMEOUT_MS)
      : undefined,
  })

  await adapter.start()

  const gracefulShutdown = (signal: string) => {
    logger.log(`Received ${signal}, shutting down OpenClaw bridge...`)
    adapter.stop()
    process.exit(0)
  }

  process.on('SIGINT', () => {
    gracefulShutdown('SIGINT')
  })

  process.on('SIGTERM', () => {
    gracefulShutdown('SIGTERM')
  })
}

main().catch((error) => {
  logger.withError(error).error('Failed to start OpenClaw bridge adapter')
  process.exit(1)
})
