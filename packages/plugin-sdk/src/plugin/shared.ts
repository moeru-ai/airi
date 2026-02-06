import type { ChannelControlPlane } from '../channels/shared'

export interface ContextInit {
  host: ChannelControlPlane
}

export interface Plugin {
  /**
   *
   */
  init?: (initContext: ContextInit) => Promise<void | undefined | false>
  /**
   *
   */
  setupModules?: () => Promise<void | undefined>
}
