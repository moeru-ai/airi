import process from 'node:process'

import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'

import { OpenClawBridgeAdapter } from './openclaw-airi-adapter.js'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)
const log = useLogg('OpenClawBridge')

async function main() {
  const airiUrl = process.env.AIRI_URL ?? 'ws://localhost:6121/ws'
  const airiToken = process.env.AIRI_TOKEN
  const gatewayWsUrl = process.env.OPENCLAW_GATEWAY_WS_URL ?? 'ws://127.0.0.1:18789'
  const gatewayAuthToken = process.env.OPENCLAW_AUTH_TOKEN
  const gatewayClientId = process.env.OPENCLAW_GATEWAY_CLIENT_ID
  const sessionKey = process.env.OPENCLAW_SESSION_KEY ?? 'main'

  log.log('Config', { airiUrl, gatewayWsUrl, sessionKey, gatewayClientId: gatewayClientId ?? 'gateway-client' })

  const adapter = new OpenClawBridgeAdapter({
    airiUrl,
    airiToken,
    gatewayWsUrl,
    gatewayAuthToken,
    gatewayClientId,
    sessionKey,
  })

  await adapter.start()

  async function gracefulShutdown(signal: string) {
    log.log(`Received ${signal}, shutting down...`)
    await adapter.stop()
    process.exit(0)
  }

  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT')
  })
  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM')
  })
}

main().catch(err => log.withError(err).error('OpenClaw bridge failed'))
