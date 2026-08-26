import type {
  ExtensionIdentity,
  ModuleConfigSchema,
  ModuleDependency,
  ModulePermissionDeclaration,
  ProtocolEvents,
  WebSocketBaseEvent,
  WebSocketEventOptionalSource,
  WebSocketEvents,
} from '@proj-airi/server-shared/types'

import type { ClientOptions, ConnectOptions } from './client'

import { createClient } from './client'

/**
 * Describes one module announcement emitted through a websocket extension peer.
 *
 * @param C - Optional custom protocol event map used for possible event declarations.
 */
export interface AnnounceExtensionModuleInput<C = undefined> {
  /** Optional configuration schema understood by the module. */
  configSchema?: ModuleConfigSchema
  /** Other modules or capabilities this module expects to exist. */
  dependencies?: ModuleDependency[]
  /** Stable module id within the owning extension session. */
  id: string
  /** Optional labels for routing, diagnostics, or inspector views. */
  labels?: Record<string, string>
  /** Human-readable module name used by registry and diagnostics. */
  name: string
  /** Runtime permissions requested by this module. */
  permissions?: ModulePermissionDeclaration
  /** Protocol events this module may emit or handle. */
  possibleEvents?: Array<keyof ProtocolEvents<C>>
}

/**
 * Describes the client operations required by {@link WebSocketExtensionPeer}.
 *
 * @param C - Optional custom protocol event map carried by the websocket client.
 */
export interface ExtensionPeerClient<C = undefined> {
  close: () => void
  connect: (options?: ConnectOptions) => Promise<void>
  onEvent?: <E extends keyof WebSocketEvents<C>>(
    event: E,
    callback: (data: WebSocketBaseEvent<E, WebSocketEvents<C>[E]>) => Promise<void> | void,
  ) => () => void
  send: (data: WebSocketEventOptionalSource<C>) => boolean
  sendOrThrow: (data: WebSocketEventOptionalSource<C>) => void
}

/**
 * Options for creating a websocket-backed extension peer. Supplying `client` lets
 * tests and embedding runtimes provide their own protocol client implementation.
 *
 * @param C - Optional custom protocol event map carried by the websocket client.
 */
export interface WebSocketExtensionPeerOptions<C = undefined> {
  client?: ExtensionPeerClient<C>
  clientOptions?: Omit<ClientOptions<C>, 'identity' | 'name'>
  extension: ExtensionIdentity
}

/**
 * Provides extension-level protocol helpers over a server-sdk protocol client.
 */
export class WebSocketExtensionPeer<C = undefined> {
  private readonly client: ExtensionPeerClient<C>
  private readonly extension: ExtensionIdentity

  constructor(options: WebSocketExtensionPeerOptions<C>) {
    this.extension = options.extension
    this.client = options.client ?? createClient<C>({
      ...options.clientOptions,
      autoConnect: options.clientOptions?.autoConnect ?? false,
      autoReconnect: options.clientOptions?.autoReconnect ?? false,
      handshake: 'manual',
      name: options.extension.id,
    })
  }

  announceExtension(input: { permissions?: ModulePermissionDeclaration } = {}): void {
    this.client.sendOrThrow({
      data: {
        identity: this.extension,
        permissions: input.permissions,
      },
      type: 'extension:announce',
    })
  }

  announceModule(input: AnnounceExtensionModuleInput<C>): void {
    this.client.sendOrThrow({
      data: {
        configSchema: input.configSchema,
        dependencies: input.dependencies,
        identity: {
          extension: this.extension,
          id: input.id,
          labels: input.labels,
        },
        name: input.name,
        permissions: input.permissions,
        possibleEvents: input.possibleEvents ?? [],
      },
      type: 'extension:module:announce',
    })
  }

  authenticatePeer(input: { peerId?: string, token?: string } = {}): void {
    this.client.sendOrThrow({
      data: input,
      type: 'peer:authenticate',
    })
  }

  close(): void {
    this.client.close()
  }

  connect(options?: ConnectOptions): Promise<void> {
    return this.client.connect(options)
  }

  onEvent<E extends keyof WebSocketEvents<C>>(
    event: E,
    callback: (data: WebSocketBaseEvent<E, WebSocketEvents<C>[E]>) => Promise<void> | void,
  ): () => void {
    if (!this.client.onEvent) {
      throw new Error('Wrapped extension peer client does not support event listeners.')
    }

    return this.client.onEvent(event, callback)
  }

  send(data: WebSocketEventOptionalSource<C>): boolean {
    return this.client.send(data)
  }
}

/** Creates a websocket extension peer over a server-sdk protocol client. */
export function createWebSocketExtensionPeer<C = undefined>(
  options: WebSocketExtensionPeerOptions<C>,
): WebSocketExtensionPeer<C> {
  return new WebSocketExtensionPeer(options)
}
