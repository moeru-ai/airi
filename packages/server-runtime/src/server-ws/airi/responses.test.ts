import { WebSocketEventSource } from '@proj-airi/server-shared/types'
import { describe, expect, it } from 'vitest'

import packageJSON from '../../../package.json'

import { createEventMetadata, createResponses } from './responses'

describe('airi websocket responses', () => {
  it('creates server metadata with source and parent event ids', () => {
    const metadata = createEventMetadata('server-1', 'parent-event-1')

    expect(metadata.source).toEqual({
      id: 'server-1',
      kind: 'plugin',
      plugin: {
        id: WebSocketEventSource.Server,
        version: packageJSON.version,
      },
    })
    expect(metadata.event).toEqual({
      id: expect.any(String),
      parentId: 'parent-event-1',
    })
  })

  it('creates peer and extension authentication response shapes', () => {
    const responses = createResponses('server-1')

    expect(responses.peerAuthenticated('peer-1', 'event-1')).toMatchObject({
      data: {
        authenticated: true,
        peerId: 'peer-1',
      },
      metadata: {
        event: {
          parentId: 'event-1',
        },
        source: {
          id: 'server-1',
          plugin: {
            id: WebSocketEventSource.Server,
            version: packageJSON.version,
          },
        },
      },
      type: 'peer:authenticated',
    })
    expect(responses.extensionAuthenticated({ id: 'airi-extension-chess' }, 'event-2')).toMatchObject({
      data: {
        authenticated: true,
        identity: {
          id: 'airi-extension-chess',
        },
      },
      metadata: {
        event: {
          parentId: 'event-2',
        },
        source: {
          id: 'server-1',
          plugin: {
            id: WebSocketEventSource.Server,
            version: packageJSON.version,
          },
        },
      },
      type: 'extension:authenticated',
    })
  })
})
