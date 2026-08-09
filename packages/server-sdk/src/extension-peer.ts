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
 * Describes the client operations required by {@link WebSocketExtensionPeer}.
 *
 * @param C - Optional custom protocol event map carried by the websocket client.
 */
export interface ExtensionPeerClient<C = undefined> {
  connect: (options?: ConnectOptions) => Promise<void>
  send: (data: WebSocketEventOptionalSource<C>) => boolean
  sendOrThrow: (data: WebSocketEventOptionalSource<C>) => void
  close: () => void
  onEvent?: <E extends keyof WebSocketEvents<C>>(
    event: E,
    callback: (data: WebSocketBaseEvent<E, WebSocketEvents<C>[E]>) => void | Promise<void>,
  ) => () => void
}

/**
 * Describes one module announcement emitted through a websocket extension peer.
 *
 * @param C - Optional custom protocol event map used for possible event declarations.
 */
export interface AnnounceExtensionModuleInput<C = undefined> {
  /** Stable module id within the owning extension session. */
  id: string
  /** Human-readable module name used by registry and diagnostics. */
  name: string
  /** Protocol events this module may emit or handle. */
  possibleEvents?: Array<keyof ProtocolEvents<C>>
  /** Runtime permissions requested by this module. */
  permissions?: ModulePermissionDeclaration
  /** Optional configuration schema understood by the module. */
  configSchema?: ModuleConfigSchema
  /** Other modules or capabilities this module expects to exist. */
  dependencies?: ModuleDependency[]
  /** Optional labels for routing, diagnostics, or inspector views. */
  labels?: Record<string, string>
}

/**
 * Options for creating a websocket-backed extension peer. Supplying `client` lets
 * tests and embedding runtimes provide their own protocol client implementation.
 *
 * @param C - Optional custom protocol event map carried by the websocket client.
 */
export interface WebSocketExtensionPeerOptions<C = undefined> {
  extension: ExtensionIdentity
  client?: ExtensionPeerClient<C>
  clientOptions?: Omit<ClientOptions<C>, 'name' | 'identity'>
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
      name: options.extension.id,
      handshake: 'manual',
      autoConnect: options.clientOptions?.autoConnect ?? false,
      autoReconnect: options.clientOptions?.autoReconnect ?? false,
    })
  }

  connect(options?: ConnectOptions): Promise<void> {
    return this.client.connect(options)
  }

  authenticatePeer(input: { token?: string, peerId?: string } = {}): void {
    this.client.sendOrThrow({
      type: 'peer:authenticate',
      data: input,
    })
  }

  announceExtension(input: { permissions?: ModulePermissionDeclaration } = {}): void {
    this.client.sendOrThrow({
      type: 'extension:announce',
      data: {
        identity: this.extension,
        permissions: input.permissions,
      },
    })
  }

  announceModule(input: AnnounceExtensionModuleInput<C>): void {
    this.client.sendOrThrow({
      type: 'extension:module:announce',
      data: {
        name: input.name,
        identity: {
          id: input.id,
          extension: this.extension,
          labels: input.labels,
        },
        possibleEvents: input.possibleEvents ?? [],
        permissions: input.permissions,
        configSchema: input.configSchema,
        dependencies: input.dependencies,
      },
    })
  }

  send(data: WebSocketEventOptionalSource<C>): boolean {
    return this.client.send(data)
  }

  onEvent<E extends keyof WebSocketEvents<C>>(
    event: E,
    callback: (data: WebSocketBaseEvent<E, WebSocketEvents<C>[E]>) => void | Promise<void>,
  ): () => void {
    if (!this.client.onEvent) {
      throw new Error('Wrapped extension peer client does not support event listeners.')
    }

    return this.client.onEvent(event, callback)
  }

  close(): void {
    this.client.close()
  }
}

/** Creates a websocket extension peer over a server-sdk protocol client. */
export function createWebSocketExtensionPeer<C = undefined>(
  options: WebSocketExtensionPeerOptions<C>,
): WebSocketExtensionPeer<C> {
  return new WebSocketExtensionPeer(options)
}
