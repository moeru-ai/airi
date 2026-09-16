import type { Bot } from 'mineflayer'

import { useLogger } from '../utils/logger'

interface MineflayerViewerOptions {
  port: number
  firstPerson?: boolean
}

export function setupMineflayerViewer(mineflayer: { bot: Bot }, options: MineflayerViewerOptions): void {
  let isViewerStarted = false

  mineflayer.bot.once('spawn', async () => {
    if (isViewerStarted)
      return

    isViewerStarted = true

    const logger = useLogger()
    try {
      const { mineflayer: mineflayerViewer } = await import('prismarine-viewer')

      mineflayerViewer(mineflayer.bot, {
        port: options.port,
        firstPerson: options.firstPerson ?? true,
      })

      logger.log(`Mineflayer viewer running at http://localhost:${options.port}`)
    }
    catch (err) {
      const e = err as NodeJS.ErrnoException
      const message = typeof e.message === 'string' ? e.message : ''
      const isCanvasMissing = e?.code === 'MODULE_NOT_FOUND' && message.includes('\'canvas\'')
      const isCanvasBinaryMissing = e?.code === 'MODULE_NOT_FOUND' && message.includes('canvas.node')

      if (isCanvasMissing || isCanvasBinaryMissing) {
        logger.log('Mineflayer viewer disabled: node-canvas is not available')
        return
      }

      logger.errorWithError('Failed to start mineflayer viewer', e as Error)
    }
  })
}
