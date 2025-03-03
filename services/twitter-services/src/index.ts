import process from 'node:process'

import { TwitterServiceLauncher } from './launcher'
import { logger } from './utils/logger';

(async () => {
  const launcher = new TwitterServiceLauncher()
  launcher.start().catch((error) => {
    logger.main.withError(error).error('启动失败')
    process.exit(1)
  })
})()
