import type { ChannelHost } from '../channels/shared'
import type { PluginApis } from './apis/client'

export interface ContextInit {
  channels: {
    host: ChannelHost
  }
  apis: PluginApis
}

export interface Plugin {
  /**
   *
   */
  init?: (initContext: ContextInit) => Promise<void | undefined | false>
  /**
   *
   */
  setupModules?: (initContext: ContextInit) => Promise<void | undefined>
}
