import type { WebSocketEvents } from '@proj-airi/server-shared/types'

import type { OpenClawBridgeClient } from './openclaw-bridge-adapter'
import type { OpenClawDelegatedTaskRequest } from './types'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OpenClawTaskHistoryStore } from './history-store'
import { OpenClawBridge } from './openclaw-bridge'
import { OpenClawBridgeAdapter } from './openclaw-bridge-adapter'
import { OpenClawGatewayClient } from './openclaw-gateway-client'
import { OPENCLAW_TASK_CONTEXT_LANE } from './types'

type SparkCommandEvent = WebSocketEvents['spark:command']

const baseRequest: OpenClawDelegatedTaskRequest = {
  taskText: 'Summarize the latest logs and propose the next repair step.',
  source: 'stage-ui',
  userId: 'user-1',
  conversationId: 'conversation-1',
  context: [{ label: 'channel', value: 'discord' }],
  returnMode: 'structured',
}

function createGatewayClient(fetchImpl: typeof globalThis.fetch) {
  return new OpenClawGatewayClient({
    baseUrl: 'https://openclaw.local',
    model: 'bridge-test-model',
    fetch: fetchImpl,
    requestTimeoutMs: 1_000,
  })
}

class MockBridgeClient implements OpenClawBridgeClient {
  readonly sent: Array<{ type: string, data: unknown }> = []
  private readonly listeners = new Set<(event: { data: SparkCommandEvent, metadata: { event: { id: string } } }) => void | Promise<void>>()

  async connect(): Promise<void> {}

  close(): void {}

  onEvent(
    event: 'spark:command',
    callback: (data: { data: SparkCommandEvent, metadata: { event: { id: string } } }) => void | Promise<void>,
  ): () => void {
    if (event !== 'spark:command') {
      throw new Error(`Unexpected event registration: ${event}`)
    }

    this.listeners.add(callback)

    return () => {
      this.listeners.delete(callback)
    }
  }

  send(data: { type: string, data: unknown }): boolean {
    this.sent.push(data)
    return true
  }

  async emitSparkCommand(data: SparkCommandEvent, eventId = 'evt-1') {
    for (const listener of this.listeners) {
      await listener({ data, metadata: { event: { id: eventId } } })
    }
  }
}

function createSparkCommand(overrides: Partial<SparkCommandEvent> = {}): SparkCommandEvent {
  return {
    id: 'spark-command-1',
    commandId: 'command-1',
    interrupt: false,
    priority: 'high',
    intent: 'action',
    destinations: ['openclaw-bridge'],
    contexts: [{
      id: 'ctx-1',
      contextId: 'ctx-openclaw-1',
      lane: OPENCLAW_TASK_CONTEXT_LANE,
      text: 'Check the logs and explain the next repair step.',
      strategy: ContextUpdateStrategy.AppendSelf,
      metadata: {
        openclaw: {
          conversationId: 'conversation-1',
          replyDestinations: ['proj-airi:stage-web'],
          returnMode: 'structured',
          source: 'stage-ui',
          userId: 'user-1',
        },
      },
    }],
    ...overrides,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('openClawTaskHistoryStore', () => {
  it('appends lifecycle transitions without mutating previous snapshots', () => {
    const store = new OpenClawTaskHistoryStore()
    const queued = store.createQueuedTask({ request: baseRequest, taskId: 'task-1', timestamp: 1 })

    const running = store.updateTask({ taskId: 'task-1', status: 'running', note: 'Working', timestamp: 2 })
    const completed = store.updateTask({
      taskId: 'task-1',
      status: 'completed',
      note: 'Finished',
      result: { summary: 'Done' },
      timestamp: 3,
    })

    expect(queued.statusHistory).toHaveLength(1)
    expect(running.statusHistory.map(entry => entry.status)).toEqual(['queued', 'running'])
    expect(completed.statusHistory.map(entry => entry.status)).toEqual(['queued', 'running', 'completed'])
    expect(completed.result?.summary).toBe('Done')
  })
})

describe('openClawGatewayClient', () => {
  it('posts to the chat completions endpoint by default and normalizes chat responses', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({ summary: 'Gateway success', structuredOutput: { ok: true } }),
        },
      }],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))

    const client = createGatewayClient(fetchMock)
    const result = await client.delegateTask({ taskId: 'task-1', ...baseRequest })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://openclaw.local/v1/chat/completions')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'bridge-test-model',
      messages: [{
        role: 'user',
      }],
      max_tokens: 1024,
      metadata: {
        taskId: 'task-1',
        source: 'stage-ui',
      },
    })
    expect(init?.headers).toMatchObject({
      'content-type': 'application/json',
      'x-openclaw-scopes': 'operator.write',
    })
    expect(result.summary).toBe('Gateway success')
    expect(result.structuredOutput).toEqual({ ok: true })
  })
})

describe('openClawBridge', () => {
  it('tracks queued, running, and completed lifecycle states', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify({ summary: 'Task complete', structuredOutput: { success: true } }),
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const bridge = new OpenClawBridge({
      gatewayClient: createGatewayClient(fetchMock),
      taskIdFactory: () => 'task-1',
    })

    const updates: string[] = []
    const flush = vi.fn()
    bridge.onTaskUpdate((update) => {
      updates.push(update.status)
      flush()
    })

    bridge.delegateTask(baseRequest, { sourceEventId: 'parent-1' })
    await vi.waitFor(() => {
      expect(flush).toHaveBeenCalledTimes(3)
    })

    expect(updates).toEqual(['queued', 'running', 'completed'])
    expect(bridge.getTask('task-1')).toMatchObject({
      sourceEventId: 'parent-1',
      status: 'completed',
      result: {
        summary: 'Task complete',
      },
    })
  })

  it('marks aborted tasks as cancelled', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_input, init) => {
      await new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason ?? new DOMException('Aborted', 'AbortError'))
        }, { once: true })
      })

      return new Response(null, { status: 204 })
    })

    const bridge = new OpenClawBridge({
      gatewayClient: createGatewayClient(fetchMock),
      taskIdFactory: () => 'task-cancel',
    })

    bridge.delegateTask(baseRequest)
    expect(bridge.cancelTask('task-cancel', 'User cancelled task')).toBe(true)

    await vi.waitFor(() => {
      expect(bridge.getTask('task-cancel')?.status).toBe('cancelled')
    })
  })
})

describe('openClawBridgeAdapter', () => {
  it('listens for spark commands and emits spark progress plus context summaries', async () => {
    const mockClient = new MockBridgeClient()
    const bridge = new OpenClawBridge({
      gatewayClient: createGatewayClient(vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
        output_text: JSON.stringify({ summary: 'Adapter completed', structuredOutput: { delivered: true } }),
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))),
      taskIdFactory: () => 'task-adapter',
    })
    const adapter = new OpenClawBridgeAdapter({
      baseUrl: 'https://openclaw.local',
      model: 'bridge-test-model',
      client: mockClient,
      bridge,
    })

    await adapter.start()
    await mockClient.emitSparkCommand(createSparkCommand(), 'parent-evt')

    await vi.waitFor(() => {
      expect(mockClient.sent.length).toBeGreaterThanOrEqual(4)
    })

    const eventTypes = mockClient.sent.map(item => item.type)
    expect(eventTypes).toContain('spark:emit')
    expect(eventTypes).toContain('context:update')

    const lastContextUpdate = [...mockClient.sent]
      .reverse()
      .find(item => item.type === 'context:update')

    expect(lastContextUpdate).toMatchObject({
      type: 'context:update',
      data: {
        contextId: 'openclaw:task-adapter',
        lane: 'openclaw:result',
        text: 'Adapter completed',
      },
    })

    adapter.stop()
  })
})
