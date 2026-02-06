import type { EventContext } from '@moeru/eventa'

import { createContext } from '@moeru/eventa'

export const channels = {
  /**
   * Channel for talking to Plugin Host.
   * Can be seen as Control plane.
   *
   * createContext() here is for fallback internal channel preventing undefined access.
   * In real usage, either local/* or remote/* channel implementation should be set as active channel.
   */
  host: createContext(),
  /**
   * Channel for initialized plugin to transmit events to each other, includes plugins, and stage, configurator, etc.
   * Can be seen as Data plane.
   *
   * createContext() here is for fallback internal channel preventing undefined access.
   * In real usage, either local/* or remote/* channel implementation should be set as active channel.
   */
  data: createContext(),
}

export function setActiveHostChannel(context: EventContext<any, any>) {
  channels.host = context
}

export function setActiveDataChannel(context: EventContext<any, any>) {
  channels.data = context
}
