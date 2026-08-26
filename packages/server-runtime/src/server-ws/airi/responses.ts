import type { ExtensionIdentity, MessageHeartbeat, MessageHeartbeatKind, MetadataEventSource, WebSocketEvent } from '@proj-airi/server-shared/types'

import { ServerErrorMessages } from '@proj-airi/server-shared'
import { WebSocketEventSource } from '@proj-airi/server-shared/types'
import { nanoid } from 'nanoid'

import packageJSON from '../../../package.json'

/** Creates AIRI server event metadata and preserves optional parent correlation. */
export function createEventMetadata(
  serverInstanceId: string,
  parentId?: string,
): { source: MetadataEventSource, event: { id: string, parentId?: string } } {
  return {
    event: {
      id: nanoid(),
      parentId,
    },
    source: {
      kind: 'plugin',
      plugin: {
        id: WebSocketEventSource.Server,
        version: packageJSON.version,
      },
      id: serverInstanceId,
    },
  }
}

/** Creates AIRI server response event factories. */
export function createResponses(serverInstanceId: string) {
  return {
    authenticated(parentId?: string) {
      return {
        type: 'module:authenticated',
        data: { authenticated: true },
        metadata: createEventMetadata(serverInstanceId, parentId),
      } satisfies WebSocketEvent<Record<string, unknown>>
    },
    peerAuthenticated(peerId: string, parentId?: string) {
      return {
        type: 'peer:authenticated',
        data: { authenticated: true, peerId },
        metadata: createEventMetadata(serverInstanceId, parentId),
      } satisfies WebSocketEvent<Record<string, unknown>>
    },
    extensionAuthenticated(identity: ExtensionIdentity, parentId?: string) {
      return {
        type: 'extension:authenticated',
        data: { identity, authenticated: true },
        metadata: createEventMetadata(serverInstanceId, parentId),
      } satisfies WebSocketEvent<Record<string, unknown>>
    },
    notAuthenticated(parentId?: string) {
      return {
        type: 'error',
        data: { message: ServerErrorMessages.notAuthenticated },
        metadata: createEventMetadata(serverInstanceId, parentId),
      } satisfies WebSocketEvent<Record<string, unknown>>
    },
    error(message: string, parentId?: string) {
      return {
        type: 'error',
        data: { message },
        metadata: createEventMetadata(serverInstanceId, parentId),
      } satisfies WebSocketEvent<Record<string, unknown>>
    },
    heartbeat(kind: MessageHeartbeatKind, message: MessageHeartbeat | string, parentId?: string) {
      return {
        type: 'transport:connection:heartbeat',
        data: { kind, message, at: Date.now() },
        metadata: createEventMetadata(serverInstanceId, parentId),
      } satisfies WebSocketEvent<Record<string, unknown>>
    },
  }
}
