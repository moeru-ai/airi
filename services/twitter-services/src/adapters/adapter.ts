import type { Config } from '../config/types'
import type { Context } from '../core/browser/context'
import type { AiriAdapter } from './airi-adapter'
import type { MCPAdapter } from './mcp-adapter'

import { logger } from '../utils/logger'

export function useAdapter() {
  const adapters: { airi?: AiriAdapter, mcp?: MCPAdapter } = {}

  async function initAdapters(config: Config, ctx: Context): Promise<{ airi?: AiriAdapter, mcp?: MCPAdapter }> {
    // if (config.adapters.airi?.enabled) {
    //   logger.main.log('Starting Airi adapter...')
    //   const { AiriAdapter } = await import('./adapters/airi-adapter')

    //   adapters.airi = new AiriAdapter(twitterService, {
    //     url: config.adapters.airi.url,
    //     token: config.adapters.airi.token,
    //     credentials: {},
    //   })

    //   await adapters.airi.start()
    //   logger.main.log('Airi adapter started')
    // }

    if (config.adapters.mcp?.enabled) {
      logger.main.log('Starting MCP adapter...')
      const { MCPAdapter } = await import('./mcp-adapter')

      adapters.mcp = new MCPAdapter(config.adapters.mcp.port, ctx)

      await adapters.mcp.start()
      logger.main.log('MCP adapter started')
    }

    return adapters
  }

  return {
    adapters,
    initAdapters,
  }
}
