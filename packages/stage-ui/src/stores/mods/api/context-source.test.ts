import type { WebSocketBaseEvent, WebSocketEvents } from '@proj-airi/server-sdk'

import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useChatContextStore } from '../../chat/context-store'
import { useContextSourceStore } from './context-source'

type Handler = (event: WebSocketBaseEvent<any, any>) => void | Promise<void>

const channel = vi.hoisted(() => ({
  connectionId: 'host' as string | undefined,
  handlers: new Map<string, Handler>(),
  send: vi.fn(),
}))

vi.mock('./channel-server', () => ({
  useModsServerChannelStore: () => ({
    get connectionId() {
      return channel.connectionId
    },
    send: channel.send,
    onEvent: (type: string, handler: Handler) => {
      channel.handlers.set(type, handler)
      return () => channel.handlers.delete(type)
    },
  }),
}))

const sourceRef = { refType: 'game', targetId: 'status' }

function observation(overrides: Partial<ContextMessage> = {}): ContextMessage {
  return {
    id: 'status-event',
    contextId: 'status',
    strategy: ContextUpdateStrategy.ReplaceSelf,
    text: 'Source details: game/status',
    sourceRef,
    createdAt: Date.now(),
    destinations: { include: ['owner:private'] },
    metadata: { source: { id: 'bot', extension: { id: 'game' } }, originConnectionId: 'writer' },
    ...overrides,
  }
}

function serverEvent<E extends keyof WebSocketEvents>(type: E, data: WebSocketEvents[E], originConnectionId: string) {
  return { type, data, metadata: { source: { id: originConnectionId, extension: { id: originConnectionId } }, event: { id: `${type}-event` }, originConnectionId } }
}

async function answer(text: string, from = 'writer') {
  await vi.waitFor(() => expect(channel.send).toHaveBeenCalled())
  const request = channel.send.mock.lastCall![0]
  await channel.handlers.get('context:source:response')!(serverEvent('context:source:response', { requestId: request.data.requestId, sourceRef, text }, from))
  return request
}

describe('context source reads', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    channel.connectionId = 'host'
    channel.handlers.clear()
    channel.send.mockReset()
  })

  // ROOT CAUSE:
  // An origin handle carried no read boundary. A request must only resolve handles that its session can see.
  it('refuses a handle that the reader cannot see', async () => {
    await useChatContextStore().ingestContextMessage(observation({ destinations: { include: ['discord:channel:a'] } }))
    const sources = useContextSourceStore()
    sources.listen()

    await expect(sources.readSource({ ids: ['session', 'owner:private'] }, sourceRef)).rejects.toThrow('No visible observation')
    expect(channel.send).not.toHaveBeenCalled()
  })

  it('asks only the writer connection and ignores answers from other connections', async () => {
    await useChatContextStore().ingestContextMessage(observation())
    const sources = useContextSourceStore()
    sources.listen()

    const read = sources.readSource({ ids: ['session', 'owner:private'] }, sourceRef)
    const request = await answer('forged details', 'other-module')
    expect(request).toMatchObject({ type: 'context:source:request', route: { destinations: [{ type: 'connection', connections: ['writer'] }] }, data: { sourceRef } })
    await answer('Players: Alice, Bob')

    await expect(read).resolves.toEqual({ text: 'Players: Alice, Bob', truncated: false })
  })

  it('cuts oversized details to the source token limit', async () => {
    await useChatContextStore().ingestContextMessage(observation())
    const sources = useContextSourceStore()
    sources.listen()

    const read = sources.readSource({ ids: ['owner:private'] }, sourceRef)
    await answer(' detail'.repeat(5000))

    const result = await read
    expect(result.truncated).toBe(true)
    expect(result.text.length).toBeLessThan(' detail'.repeat(5000).length)
  })

  it('reads its own handles locally and answers other renderers through the requester route', async () => {
    channel.connectionId = 'writer'
    await useChatContextStore().ingestContextMessage(observation())
    const sources = useContextSourceStore()
    sources.registerSource('game', ref => ref.targetId === 'status' ? 'local details' : undefined)
    sources.listen()

    await expect(sources.readSource({ ids: ['owner:private'] }, sourceRef)).resolves.toEqual({ text: 'local details', truncated: false })
    expect(channel.send).not.toHaveBeenCalled()

    await channel.handlers.get('context:source:request')!(serverEvent('context:source:request', { requestId: 'remote', sourceRef }, 'leader'))
    await channel.handlers.get('context:source:request')!(serverEvent('context:source:request', { requestId: 'gone', sourceRef: { ...sourceRef, targetId: 'gone' } }, 'leader'))
    expect(channel.send.mock.calls.map(([event]) => [event.route, event.data])).toEqual([
      [{ destinations: [{ type: 'connection', connections: ['leader'] }] }, { requestId: 'remote', sourceRef, text: 'local details' }],
      [{ destinations: [{ type: 'connection', connections: ['leader'] }] }, { requestId: 'gone', sourceRef: { ...sourceRef, targetId: 'gone' }, error: 'Source unavailable' }],
    ])
  })
})
