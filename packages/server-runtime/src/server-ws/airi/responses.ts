import type { ExtensionIdentity, MessageHeartbeat, MessageHeartbeatKind, MetadataEventSource, WebSocketEvent } from '@proj-airi/server-shared/types'

import { ServerErrorMessages } from '@proj-airi/server-shared'
import { WebSocketEventSource } from '@proj-airi/server-shared/types'
import { nanoid } from 'nanoid'

import packageJSON from '../../../package.json'

/** Creates AIRI server event metadata and preserves optional parent correlation. */
export function createEventMetadata(
  serverInstanceId: string,
  parentId?: string,
): { event: { id: string, parentId?: string }, source: MetadataEventSource } {
  return {
    event: {
      id: nanoid(),
      parentId,
    },
    source: {
      id: serverInstanceId,
      kind: 'plugin',
      plugin: {
        id: WebSocketEventSource.Server,
        version: packageJSON.version,
      },
    },
  }
}

/** Creates AIRI server response event factories. */
export function createResponses(serverInstanceId: string) {
  return {
    authenticated(parentId?: string) {
      return {
        data: { authenticated: true },
        metadata: createEventMetadata(serverInstanceId, parentId),
        type: 'module:authenticated',
      } satisfies WebSocketEvent<Record<string, unknown>>
    },
    error(message: string, parentId?: string) {
      return {
        data: { message },
        metadata: createEventMetadata(serverInstanceId, parentId),
        type: 'error',
      } satisfies WebSocketEvent<Record<string, unknown>>
    },
    extensionAuthenticated(identity: ExtensionIdentity, parentId?: string) {
      return {
        data: { authenticated: true, identity },
        metadata: createEventMetadata(serverInstanceId, parentId),
        type: 'extension:authenticated',
      } satisfies WebSocketEvent<Record<string, unknown>>
    },
    heartbeat(kind: MessageHeartbeatKind, message: MessageHeartbeat | string, parentId?: string) {
      return {
        data: { at: Date.now(), kind, message },
        metadata: createEventMetadata(serverInstanceId, parentId),
        type: 'transport:connection:heartbeat',
      } satisfies WebSocketEvent<Record<string, unknown>>
    },
    notAuthenticated(parentId?: string) {
      return {
        data: { message: ServerErrorMessages.notAuthenticated },
        metadata: createEventMetadata(serverInstanceId, parentId),
        type: 'error',
      } satisfies WebSocketEvent<Record<string, unknown>>
    },
    peerAuthenticated(peerId: string, parentId?: string) {
      return {
        data: { authenticated: true, peerId },
        metadata: createEventMetadata(serverInstanceId, parentId),
        type: 'peer:authenticated',
      } satisfies WebSocketEvent<Record<string, unknown>>
    },
  }
}
