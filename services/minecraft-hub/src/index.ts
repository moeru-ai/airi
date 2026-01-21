import process, { exit } from 'node:process'

import { loadConfig } from './config'
import { startHub } from './hub'
import { initLogger, useLogger } from './logger'

async function main() {
  initLogger()
  const logger = useLogger('minecraft-hub')
  const config = loadConfig()

  const hub = await startHub(config)

  process.on('SIGINT', () => {
    logger.log('Received SIGINT, shutting down...')
    void hub.close()
    exit(0)
  })
}

main().catch((error: Error) => {
  useLogger('minecraft-hub').errorWithError('Fatal error', error)
  exit(1)
})
