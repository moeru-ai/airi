import type { ExtensionSettings } from '../shared/types'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SETTINGS } from '../shared/constants'
import { createClientState, disconnectClient, ensureClient, handleVideoContext, notifyVideo } from './client'

const clients = vi.hoisted(() => [] as Array<{ options: Record<string, unknown>, send: ReturnType<typeof vi.fn> }>)

// The channel server is a network boundary. This fake records what the extension sends.
vi.mock('@proj-airi/server-sdk', () => ({
  ContextUpdateStrategy: { ReplaceSelf: 'replace-self' },
  Client: class {
    send = vi.fn()

    constructor(public options: Record<string, unknown>) {
      clients.push(this)
    }

    async connect() {}

    close() {}
  },
}))

const settings: ExtensionSettings = { ...DEFAULT_SETTINGS, token: 'test-token' }
const video = { site: 'youtube', url: 'https://example.com/watch?v=a', title: 'Song A', videoId: 'a' } as const

function sentEvents() {
  return clients[0]!.send.mock.calls.map(([event]) => event)
}

describe('web extension client', () => {
  afterEach(() => {
    clients.length = 0
  })

  it('announces an extension module identity with the extension id', async () => {
    const state = createClientState()

    await ensureClient(state, settings)

    expect(clients).toHaveLength(1)
    expect(clients[0]!.options.identity).toEqual({
      id: expect.any(String),
      extension: {
        id: 'proj-airi:plugin-web-extension',
        version: expect.any(String),
      },
      labels: { runtime: 'web-extension' },
    })
    disconnectClient(state)
  })

  it('sends spark notify to the stage peers', async () => {
    const state = createClientState()
    await ensureClient(state, settings)

    notifyVideo(state, settings, video)

    const notify = sentEvents().find(event => event.type === 'spark:notify')
    expect(notify?.data.destinations).toEqual(['proj-airi:stage-*'])
    disconnectClient(state)
  })

  it('notifies a video without replacing the video context', async () => {
    const state = createClientState()
    await ensureClient(state, settings)
    handleVideoContext(state, settings, { ...video, url: 'https://example.com/watch?v=b', title: 'Song B', videoId: 'b' })
    clients[0]!.send.mockClear()

    notifyVideo(state, settings, video)

    expect(sentEvents().map(event => event.type)).toEqual(['spark:notify'])
    expect(state.lastVideo?.videoId).toBe('b')
    disconnectClient(state)
  })

  it('updates the video context without a notification', async () => {
    const state = createClientState()
    await ensureClient(state, settings)

    handleVideoContext(state, settings, video)

    expect(sentEvents().map(event => event.type)).toEqual(['context:update'])
    disconnectClient(state)
  })
})
