import type { ClientOptions, WebSocketEventOptionalSource } from '@proj-airi/server-sdk'

import type { ExtensionSettings } from '../shared/types'

import { createContextRegistry, loadContextTokenCounter } from '@proj-airi/core-agent'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createClientState, ensureClient, handlePageContext, handleSubtitle, handleVideoContext } from './client'

const send = vi.hoisted(() => vi.fn<(event: WebSocketEventOptionalSource) => void>())
const connectOptions = vi.hoisted(() => vi.fn<(options: ClientOptions) => void>())

vi.mock('@proj-airi/server-sdk', async (importOriginal) => {
  const sdk = await importOriginal<typeof import('@proj-airi/server-sdk')>()
  return {
    ...sdk,
    Client: class {
      constructor(options: ClientOptions) {
        connectOptions(options)
      }

      connect = vi.fn(async () => {})
      send = send
      close = vi.fn()
    },
  }
})

const settings: ExtensionSettings = {
  wsUrl: 'ws://localhost:6121/ws',
  token: '',
  enabled: true,
  sendPageContext: true,
  sendVideoContext: true,
  sendSubtitles: true,
  sendSparkNotify: false,
  enableVision: false,
}

describe('browser observation slots', () => {
  beforeEach(() => {
    send.mockClear()
    connectOptions.mockClear()
  })

  // ROOT CAUSE:
  // The client passed a plugin identity. The server requires an extension module identity for announcement.
  it('connects with the SDK extension module identity', async () => {
    const state = createClientState()
    await ensureClient(state, settings)

    expect(connectOptions.mock.lastCall?.[0].identity).toEqual({
      id: expect.any(String),
      extension: { id: 'proj-airi:plugin-web-extension', version: expect.any(String) },
      labels: { runtime: 'web-extension' },
    })
  })

  // ROOT CAUSE:
  // Random slot names accumulated stale observations. Long titles and subtitles failed pool admission.
  it.each(['page', 'video', 'subtitle'] as const)('admits oversized %s details in one stable slot', async (slot) => {
    const state = createClientState()
    await ensureClient(state, settings)
    const text = ' hello'.repeat(400)
    const url = 'https://example.org/watch'
    if (slot === 'page') {
      handlePageContext(state, settings, { site: 'unknown', url, title: text })
      handlePageContext(state, settings, { site: 'unknown', url, title: text })
      expect(state.lastPage?.title).toBe(text)
    }
    else if (slot === 'video') {
      handleVideoContext(state, settings, { site: 'unknown', url, title: text })
      handleVideoContext(state, settings, { site: 'unknown', url, title: text })
      expect(state.lastVideo?.title).toBe(text)
    }
    else {
      handleSubtitle(state, settings, { site: 'unknown', url, text })
      handleSubtitle(state, settings, { site: 'unknown', url, text })
      expect(state.lastSubtitle?.text).toBe(text)
    }

    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2))
    const registry = createContextRegistry({ countTokens: await loadContextTokenCounter() })
    for (const [event] of send.mock.calls) {
      if (event.type !== 'context:update')
        throw new Error('Expected a context update')
      expect(registry.ingest({ ...event.data, metadata: undefined, createdAt: Date.now() })?.mutation).toBe('replace')
      expect(event.data.contextId).toBe(`web:${slot}`)
      expect(event.data.sourceRef).toEqual({ refType: 'web-extension:context', targetId: `web:${slot}` })
    }
    expect(registry.snapshot().unknown).toHaveLength(1)
  })

  it('replaces each domain slot without retaining previous page updates', async () => {
    const state = createClientState()
    await ensureClient(state, settings)
    const registry = createContextRegistry({ countTokens: await loadContextTokenCounter() })
    for (let index = 0; index < 3; index++)
      handlePageContext(state, settings, { site: 'unknown', url: 'https://example.org', title: `Page ${index}` })
    handleVideoContext(state, settings, { site: 'unknown', url: 'https://example.org', title: 'Video' })
    handleSubtitle(state, settings, { site: 'unknown', url: 'https://example.org', text: 'Subtitle' })
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(5))
    for (const [event] of send.mock.calls) {
      if (event.type !== 'context:update')
        throw new Error('Expected a context update')
      registry.ingest({ ...event.data, metadata: undefined, createdAt: Date.now() })
    }

    expect(registry.snapshot().unknown?.map(message => message.contextId)).toEqual(['web:page', 'web:video', 'web:subtitle'])
    expect(registry.snapshot().unknown?.[0]?.text).toContain('Page 2')
  })
})
