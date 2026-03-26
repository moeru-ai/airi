import type { ModuleIdentity, ProtocolEvents, RouteConfig, WebSocketEventSource } from '@proj-airi/plugin-protocol/types'

export * from '@proj-airi/plugin-protocol/types'

export interface WebSocketEventBaseMetadata {
  source?: ModuleIdentity
  event?: {
    id?: string
    parentId?: string
  }
}

export interface WebSocketBaseEvent<T, D, S extends string = string> {
  type: T
  data: D
  /**
   * @deprecated Prefer metadata.source.
   */
  source?: WebSocketEventSource | S
  metadata: {
    source: ModuleIdentity
    event: {
      id: string
      parentId?: string
    }
  }
  route?: RouteConfig
}

export interface WebSocketEvents<C = undefined> extends ProtocolEvents<C> {}

export type WebSocketEventDataInputs
  = | WebSocketEvents['input:text']
    | WebSocketEvents['input:text:voice']
    | WebSocketEvents['input:voice']

export type WebSocketEvent<C = undefined> = {
  [K in keyof WebSocketEvents<C>]: WebSocketBaseEvent<K, WebSocketEvents<C>[K]>;
}[keyof WebSocketEvents<C>]

export type WebSocketEventOptionalSource<C = undefined> = {
  [K in keyof WebSocketEvents<C>]: Omit<WebSocketBaseEvent<K, WebSocketEvents<C>[K]>, 'metadata'> & { metadata?: WebSocketEventBaseMetadata };
}[keyof WebSocketEvents<C>]

export type WebSocketEventOf<E, C = undefined> = E extends keyof WebSocketEvents<C>
  ? Omit<WebSocketBaseEvent<E, WebSocketEvents<C>[E]>, 'metadata'> & { metadata?: WebSocketEventBaseMetadata }
  : never

export type WebSocketEventInputs
  = | WebSocketEventOf<'input:text'>
    | WebSocketEventOf<'input:text:voice'>
    | WebSocketEventOf<'input:voice'>
