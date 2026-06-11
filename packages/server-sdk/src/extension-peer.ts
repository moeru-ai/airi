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

import type { Client, ClientOptions, ConnectOptions } from './client'

import { Client as WebSocketClient } from './client'

/**
 * Describes the client operations required by {@link WebSocketExtensionPeer}.
 *
 * @param C - Optional custom protocol event map carried by the websocket client.
 */
export interface ExtensionPeerClient<C = undefined> {
  /** Opens the underlying websocket client connection. */
  connect: (options?: ConnectOptions) => Promise<void>
  /** Sends one typed websocket event and reports whether it was accepted by the transport. */
  send: (data: WebSocketEventOptionalSource<C>) => boolean
  /** Sends one typed websocket event or throws when the transport is unavailable. */
  sendOrThrow: (data: WebSocketEventOptionalSource<C>) => void
  /** Closes the underlying websocket client connection. */
  close: () => void
  /** Registers a typed event listener when backed by the standard server-sdk Client. */
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
 * Options for creating a websocket-backed extension peer.
 *
 * @param C - Optional custom protocol event map carried by the websocket client.
 */
export interface WebSocketExtensionPeerOptions<C = undefined> {
  /** Extension session identity announced after peer authentication. */
  extension: ExtensionIdentity
  /** Optional prebuilt client used by tests or embedding runtimes. */
  client?: ExtensionPeerClient<C>
  /** Standard server-sdk Client options used when `client` is not supplied. */
  clientOptions?: Omit<ClientOptions<C>, 'name' | 'identity'>
}

/**
 * Provides extension-level protocol helpers over the existing websocket Client.
 *
 * Use when:
 * - A remote extension talks to an AIRI host over websocket transport
 * - Authoring/runtime code should say peer/extension/module explicitly instead of sending raw websocket events
 *
 * Expects:
 * - The underlying client owns websocket lifecycle and serialization
 * - The host interprets `peer:*`, `extension:*`, and `extension:module:*` protocol events
 *
 * Returns:
 * - A thin transport peer that delegates connection and event sending to server-sdk Client
 */
export class WebSocketExtensionPeer<C = undefined> {
  private readonly client: ExtensionPeerClient<C>
  private readonly extension: ExtensionIdentity

  constructor(options: WebSocketExtensionPeerOptions<C>) {
    this.extension = options.extension
    this.client = options.client ?? new WebSocketClient<C>({
      ...options.clientOptions,
      name: options.extension.id,
      handshake: 'manual',
      autoConnect: options.clientOptions?.autoConnect ?? false,
      autoReconnect: options.clientOptions?.autoReconnect ?? false,
    }) as Client<C>
  }

  /**
   * Opens the underlying websocket connection.
   *
   * Use when:
   * - The extension transport should begin peer authentication or announcement
   *
   * Expects:
   * - The wrapped client can reach the configured websocket URL
   *
   * Returns:
   * - Resolves when the wrapped client reports readiness
   */
  connect(options?: ConnectOptions): Promise<void> {
    return this.client.connect(options)
  }

  /**
   * Sends transport-level peer authentication.
   *
   * Use when:
   * - A websocket connection needs to authenticate before extension session grant
   *
   * Expects:
   * - The websocket connection is already open or the client can queue/send immediately
   *
   * Returns:
   * - Nothing; send failures are surfaced by the wrapped client
   */
  authenticatePeer(input: { token?: string, peerId?: string } = {}): void {
    this.client.sendOrThrow({
      type: 'peer:authenticate',
      data: input,
    })
  }

  /**
   * Announces the extension session after peer authentication.
   *
   * Use when:
   * - The remote peer has permission to enter extension setup
   *
   * Expects:
   * - Permissions represent the extension-level ceiling grant or declaration snapshot
   *
   * Returns:
   * - Nothing; send failures are surfaced by the wrapped client
   */
  announceExtension(input: { permissions?: ModulePermissionDeclaration } = {}): void {
    this.client.sendOrThrow({
      type: 'extension:announce',
      data: {
        identity: this.extension,
        permissions: input.permissions,
      },
    })
  }

  /**
   * Announces one module registered by the current extension.
   *
   * Use when:
   * - A websocket extension dynamically registers module capabilities
   *
   * Expects:
   * - `id` is stable within this extension session
   *
   * Returns:
   * - Nothing; send failures are surfaced by the wrapped client
   */
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

  /**
   * Sends a typed websocket event through the wrapped client.
   *
   * Use when:
   * - Runtime code has a protocol event not covered by helper methods
   *
   * Expects:
   * - Callers pass a server-shared websocket event
   *
   * Returns:
   * - Whether the event was accepted by the underlying transport
   */
  send(data: WebSocketEventOptionalSource<C>): boolean {
    return this.client.send(data)
  }

  /**
   * Registers one event listener when the wrapped client supports typed listeners.
   *
   * Use when:
   * - The remote extension needs to observe host protocol events
   *
   * Expects:
   * - Test doubles may omit listener support
   *
   * Returns:
   * - A disposer that removes the listener
   */
  onEvent<E extends keyof WebSocketEvents<C>>(
    event: E,
    callback: (data: WebSocketBaseEvent<E, WebSocketEvents<C>[E]>) => void | Promise<void>,
  ): () => void {
    if (!this.client.onEvent) {
      throw new Error('Wrapped extension peer client does not support event listeners.')
    }

    return this.client.onEvent(event, callback)
  }

  /**
   * Closes the underlying websocket client.
   *
   * Use when:
   * - The extension transport is disposed
   *
   * Expects:
   * - Close is idempotent in the wrapped client
   *
   * Returns:
   * - Nothing
   */
  close(): void {
    this.client.close()
  }
}

/**
 * Creates a websocket extension peer over server-sdk Client.
 *
 * Use when:
 * - Code prefers a function factory over direct class construction
 *
 * Expects:
 * - `extension.id` is the stable extension id
 *
 * Returns:
 * - A {@link WebSocketExtensionPeer} ready to connect and announce
 */
export function createWebSocketExtensionPeer<C = undefined>(
  options: WebSocketExtensionPeerOptions<C>,
): WebSocketExtensionPeer<C> {
  return new WebSocketExtensionPeer(options)
}
