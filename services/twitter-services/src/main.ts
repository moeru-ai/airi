import process from 'node:process'

import { TwitterServiceLauncher } from './launcher'
import { initializeLogger, logger } from './utils/logger'

// Ensure initialization only happens once
async function bootstrap() {
  // 1. First initialize logging system
  initializeLogger()

  // 2. Then create and start service
  const launcher = new TwitterServiceLauncher()

  try {
    await launcher.start()
    logger.main.log('Twitter service successfully started')
  }
  catch (error) {
    logger.main.withError(error).error('Startup failed')
    process.exit(1)
  }

  // Set up process event handling
  process.on('unhandledRejection', (reason) => {
    logger.main.withError(reason).error('Unhandled Promise rejection:')
  })
}

// Start application
bootstrap()
