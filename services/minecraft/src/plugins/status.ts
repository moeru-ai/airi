import type { MineflayerPlugin } from '../libs/mineflayer/plugin'

import { useLoggerer } from '../utils/logger'

export function Status(): MineflayerPlugin {
  return {
    created(bot) {
      const logger = useLoggerer()
      logger.log('Loading status component')

      bot.onCommand('status', () => {
        logger.log('Status command received')
        const status = bot.status.toOneLiner()
        bot.bot.chat(status)
      })
    },
  }
}
