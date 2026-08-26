import type { MetadataEventSource, ProtocolEvents, RouteConfig, WebSocketEventSource } from '@proj-airi/plugin-protocol/types'

export * from '@proj-airi/plugin-protocol/types'

export interface WebSocketBaseEvent<T, D, S extends string = string> {
  data: D
  metadata: {
    event: {
      id: string
      parentId?: string
    }
    source: MetadataEventSource
  }
  route?: RouteConfig
  /**
   * @deprecated Prefer metadata.source.
   */
  source?: S | WebSocketEventSource
  type: T
}

export type WebSocketEvent<C = undefined> = {
  [K in keyof WebSocketEvents<C>]: WebSocketBaseEvent<K, WebSocketEvents<C>[K]>;
}[keyof WebSocketEvents<C>]

export interface WebSocketEventBaseMetadata {
  event?: {
    id?: string
    parentId?: string
  }
  source?: MetadataEventSource
}

export type WebSocketEventDataInputs
  = | WebSocketEvents['input:text']
    | WebSocketEvents['input:text:voice']
    | WebSocketEvents['input:voice']

export type WebSocketEventInputs
  = | WebSocketEventOf<'input:text'>
    | WebSocketEventOf<'input:text:voice'>
    | WebSocketEventOf<'input:voice'>

export type WebSocketEventOf<E, C = undefined> = E extends keyof WebSocketEvents<C>
  ? Omit<WebSocketBaseEvent<E, WebSocketEvents<C>[E]>, 'metadata'> & { metadata?: WebSocketEventBaseMetadata }
  : never

export type WebSocketEventOptionalSource<C = undefined> = {
  [K in keyof WebSocketEvents<C>]: Omit<WebSocketBaseEvent<K, WebSocketEvents<C>[K]>, 'metadata'> & { metadata?: WebSocketEventBaseMetadata };
}[keyof WebSocketEvents<C>]

export interface WebSocketEvents<C = undefined> extends ProtocolEvents<C> {}
