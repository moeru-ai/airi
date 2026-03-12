import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message, Tool } from '@xsai/shared-chat'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSseChunkTransform, runManualToolLoop } from './llm-tool-loop'
import { clearMcpToolBridge, setMcpToolBridge } from './mcp-tool-bridge'

// ---------------------------------------------------------------------------
// Helpers — fake SSE stream that returns canned responses
// ---------------------------------------------------------------------------

function sseChunk(data: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
}

function doneChunk(): Uint8Array {
  return new TextEncoder().encode('data: [DONE]\n\n')
}

function buildSseBody(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let idx = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(chunks[idx++])
      }
      else {
        controller.close()
      }
    },
  })
}

/**
 * Create a mock fetch that returns one SSE response per call.
 * Each element in `responses` is an array of SSE data objects.
 */
function createMockFetch(responses: Array<Array<Record<string, unknown>>>) {
  let callIdx = 0
  return vi.fn(async () => {
    const dataObjs = responses[callIdx] ?? responses[responses.length - 1]
    callIdx++
    const chunks = [...dataObjs.map(d => sseChunk(d)), doneChunk()]
    return new Response(buildSseBody(chunks), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    })
  })
}

/** SSE data object for a text-only assistant response */
function textOnlyResponse(text: string, finishReason = 'stop') {
  return [
    { choices: [{ delta: { content: text }, finish_reason: null }] },
    { choices: [{ delta: {}, finish_reason: finishReason }] },
  ]
}

/** SSE data object for an assistant response with a tool call */
function toolCallResponse(toolName: string, args: Record<string, unknown>, toolCallId = 'tc-1', finishReason = 'tool_calls') {
  return [
    {
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            id: toolCallId,
            function: { name: toolName, arguments: JSON.stringify(args) },
          }],
        },
        finish_reason: null,
      }],
    },
    { choices: [{ delta: {}, finish_reason: finishReason }] },
  ]
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function createChatProvider(mockFetch: (...args: any[]) => Promise<Response>): ChatProvider {
  return {
    chat: () => ({
      baseURL: new URL('https://models.github.ai/chat/completions'),
      apiKey: 'test-key',
      fetch: mockFetch as any,
    }),
  } as unknown as ChatProvider
}

function createDummyTool(name: string, executeFn?: (...args: any[]) => any): Tool {
  return {
    type: 'function',
    function: {
      name,
      description: `mock tool: ${name}`,
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    execute: executeFn ?? vi.fn(async () => 'ok'),
  } as unknown as Tool
}

describe('runManualToolLoop', () => {
  beforeEach(() => {
    clearMcpToolBridge()
    setMcpToolBridge({
      listTools: vi.fn().mockResolvedValue([]),
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'tool ok' }],
      }),
    })
  })

  afterEach(() => {
    clearMcpToolBridge()
    vi.restoreAllMocks()
  })

  it('finishes immediately when assistant responds with text only (no tools, step > 0 semantics)', async () => {
    // When the model genuinely doesn't need tools on the SECOND+ step,
    // it should finish without retry.
    const mockFetch = createMockFetch([
      // Step 0: model makes a tool call
      toolCallResponse('dummy_tool', {}),
      // Step 1: model responds with text only — should finish
      textOnlyResponse('All done.'),
    ])

    const events: string[] = []
    await runManualToolLoop({
      chatProvider: createChatProvider(mockFetch),
      maxSteps: 5,
      messages: [{ role: 'user', content: 'hi' }],
      model: 'gpt-4.1',
      tools: [createDummyTool('dummy_tool')],
      promptContentMode: 'default',
      onStreamEvent: async (e) => { events.push(e.type) },
    })

    // fetch called twice: once for step 0 (tool call), once for step 1 (text only)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(events).toContain('finish')
  })

  it('retries once on step 0 when model returns text without calling tools', async () => {
    const mockFetch = createMockFetch([
      // Step 0: model fabricates text without calling tools
      textOnlyResponse('I ran the tests and they all pass.'),
      // Step 1 (retry): after developer nudge, model actually calls the tool
      toolCallResponse('mcp_call_tool', { name: 'demo::run', parameters: [] }),
      // Step 2: model finishes
      textOnlyResponse('Done — all tests passed.'),
    ])

    const events: string[] = []
    await runManualToolLoop({
      chatProvider: createChatProvider(mockFetch),
      maxSteps: 5,
      messages: [{ role: 'user', content: 'run workflow_run_tests' }],
      model: 'gpt-4.1',
      tools: [createDummyTool('mcp_call_tool')],
      promptContentMode: 'default',
      onStreamEvent: async (e) => { events.push(e.type) },
    })

    // 3 fetch calls: fabricated text → retry with tool call → final text
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(events).toContain('tool-call')
    expect(events).toContain('finish')
  })

  it('does not retry endlessly — only retries once on step 0', async () => {
    const mockFetch = createMockFetch([
      // Step 0: text only (triggers retry)
      textOnlyResponse('Let me check...'),
      // Step 1 (retry): still text only — should finish, NOT retry again
      textOnlyResponse('Everything looks good.'),
    ])

    const events: string[] = []
    await runManualToolLoop({
      chatProvider: createChatProvider(mockFetch),
      maxSteps: 5,
      messages: [{ role: 'user', content: 'run workflow_run_tests' }],
      model: 'gpt-4.1',
      tools: [createDummyTool('mcp_call_tool')],
      promptContentMode: 'default',
      onStreamEvent: async (e) => { events.push(e.type) },
    })

    // Only 2 fetch calls: fabricated → retry text (finishes)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(events).toContain('finish')
    // No tool-call should have been emitted
    expect(events).not.toContain('tool-call')
  })

  it('does not retry when no tools are provided', async () => {
    const mockFetch = createMockFetch([
      textOnlyResponse('Hello!'),
    ])

    const events: string[] = []
    await runManualToolLoop({
      chatProvider: createChatProvider(mockFetch),
      maxSteps: 5,
      messages: [{ role: 'user', content: 'hi' }],
      model: 'gpt-4.1',
      tools: [],
      promptContentMode: 'default',
      onStreamEvent: async (e) => { events.push(e.type) },
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(events).toContain('finish')
  })

  it('does not retry a normal conversational reply on the first step when tools are available', async () => {
    const mockFetch = createMockFetch([
      textOnlyResponse('Hello from AIRI desktop E2E!'),
    ])

    const events: string[] = []
    await runManualToolLoop({
      chatProvider: createChatProvider(mockFetch),
      maxSteps: 5,
      messages: [{ role: 'user', content: 'Reply with one short sentence only: hello from AIRI desktop E2E.' }],
      model: 'gpt-4.1',
      tools: [createDummyTool('mcp_call_tool')],
      promptContentMode: 'default',
      onStreamEvent: async (event) => { events.push(event.type) },
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(events).toContain('text-delta')
    expect(events).toContain('finish')
  })

  it('retries once for a Chinese desktop-action request when the model fabricates a result', async () => {
    const mockFetch = createMockFetch([
      textOnlyResponse('我已经打开了 Discord 设置页，并且启用了集成。'),
      toolCallResponse('mcp_call_tool', {
        name: 'airi_self_devtools::navigate_page',
        parameters: [
          { name: 'url', value: 'http://localhost:9222' },
        ],
      }),
      textOnlyResponse('已经实际调用工具并完成。'),
    ])

    const events: string[] = []
    await runManualToolLoop({
      chatProvider: createChatProvider(mockFetch),
      maxSteps: 5,
      messages: [{
        role: 'user',
        content: '请使用 airi_self_devtools 打开 /settings/modules/messaging-discord，然后切换 Discord 集成开关。',
      }],
      model: 'gpt-4.1',
      tools: [createDummyTool('mcp_call_tool')],
      promptContentMode: 'default',
      onStreamEvent: async (event) => { events.push(event.type) },
    })

    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(events).toContain('tool-call')
    expect(events).toContain('finish')
  })

  it('retries once for a clipboard/token transfer request when the model narrates instead of calling tools', async () => {
    const mockFetch = createMockFetch([
      textOnlyResponse('I copied the Discord token and pasted it into AIRI settings.'),
      toolCallResponse('mcp_call_tool', {
        name: 'computer_use::clipboard_read_text',
        parameters: [
          { name: 'maxLength', value: 256 },
        ],
      }),
      textOnlyResponse('The clipboard tool was actually called.'),
    ])

    const events: string[] = []
    await runManualToolLoop({
      chatProvider: createChatProvider(mockFetch),
      maxSteps: 5,
      messages: [{
        role: 'user',
        content: '从浏览器复制 Discord token，再填回 AIRI 设置页，必要时读取剪贴板。',
      }],
      model: 'gpt-4.1',
      tools: [createDummyTool('mcp_call_tool')],
      promptContentMode: 'default',
      onStreamEvent: async (event) => { events.push(event.type) },
    })

    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(events).toContain('tool-call')
    expect(events).toContain('finish')
  })

  it('retries once for a local env secret request when the model narrates instead of calling tools', async () => {
    const mockFetch = createMockFetch([
      textOnlyResponse('I checked the .env file and found the Discord token.'),
      toolCallResponse('mcp_call_tool', {
        name: 'computer_use::secret_read_env_value',
        parameters: [
          { name: 'filePath', value: '/Users/liuziheng/airi/.env' },
          { name: 'keys', value: ['AIRI_E2E_DISCORD_TOKEN', 'DISCORD_BOT_TOKEN'] },
        ],
      }),
      textOnlyResponse('The secret tool was actually called.'),
    ])

    const events: string[] = []
    await runManualToolLoop({
      chatProvider: createChatProvider(mockFetch),
      maxSteps: 5,
      messages: [{
        role: 'user',
        content: '请从 /Users/liuziheng/airi/.env 里读取 Discord token，不要直接输出整份文件。',
      }],
      model: 'gpt-4.1',
      tools: [createDummyTool('mcp_call_tool')],
      promptContentMode: 'default',
      onStreamEvent: async (event) => { events.push(event.type) },
    })

    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(events).toContain('tool-call')
    expect(events).toContain('finish')
  })

  it('injects a developer message in the retry attempt', async () => {
    // Capture the request bodies to verify the developer nudge is injected
    const requestBodies: any[] = []
    let callIdx = 0
    const responses = [
      textOnlyResponse('Fabricated result'),
      toolCallResponse('mcp_call_tool', { name: 'demo::run', parameters: [] }),
      textOnlyResponse('Done.'),
    ]

    const mockFetch = vi.fn(async (...fetchArgs: any[]) => {
      const init = fetchArgs[1] as any
      if (init?.body) {
        try {
          requestBodies.push(JSON.parse(init.body))
        }
        catch {}
      }
      const dataObjs = responses[callIdx] ?? responses[responses.length - 1]
      callIdx++
      const chunks = [...dataObjs.map((d: any) => sseChunk(d)), doneChunk()]
      return new Response(buildSseBody(chunks), {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    })

    await runManualToolLoop({
      chatProvider: createChatProvider(mockFetch),
      maxSteps: 5,
      messages: [{ role: 'user', content: 'run tests' }],
      model: 'gpt-4.1',
      tools: [createDummyTool('mcp_call_tool')],
      promptContentMode: 'default',
    })

    // The second request (retry) should contain a developer message
    expect(requestBodies.length).toBeGreaterThanOrEqual(2)
    const retryBody = requestBodies[1]
    const developerMessages = retryBody.messages.filter((m: Message) => m.role === 'developer')
    expect(developerMessages.length).toBeGreaterThan(0)
    expect(developerMessages.some((m: any) =>
      typeof m.content === 'string' && m.content.includes('MUST make the tool call NOW'),
    )).toBe(true)
  })

  it('normalizes dot-qualified MCP tool names during the manual tool loop', async () => {
    const callTool = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'tool ok' }],
    })

    clearMcpToolBridge()
    setMcpToolBridge({
      listTools: vi.fn().mockResolvedValue([]),
      callTool,
    })

    const mockFetch = createMockFetch([
      toolCallResponse('mcp_call_tool', {
        name: 'computer_use.terminal_exec',
        parameters: [
          { name: 'command', value: 'pwd' },
        ],
      }),
      textOnlyResponse('Done.'),
    ])

    await runManualToolLoop({
      chatProvider: createChatProvider(mockFetch),
      maxSteps: 5,
      messages: [{ role: 'user', content: 'Run a terminal command.' }],
      model: 'gpt-4.1',
      tools: [createDummyTool('mcp_call_tool')],
      promptContentMode: 'default',
    })

    expect(callTool).toHaveBeenCalledWith({
      name: 'computer_use::terminal_exec',
      arguments: {
        command: 'pwd',
      },
      requestId: 'tc-1',
    })
  })

  it('treats [DONE] as a terminal SSE frame even when the transport stays open', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(sseChunk({ choices: [{ delta: { content: 'Hello' }, finish_reason: null }] }))
        controller.enqueue(sseChunk({ choices: [{ delta: {}, finish_reason: 'stop' }] }))
        controller.enqueue(doneChunk())
      },
    })

    const received: Array<Record<string, unknown>> = []
    await stream
      .pipeThrough(createSseChunkTransform())
      .pipeTo(new WritableStream({
        write(chunk) {
          received.push(chunk as Record<string, unknown>)
        },
      }))

    expect(received).toHaveLength(2)
    expect(received[0]?.choices).toBeTruthy()
    expect(received[1]?.choices).toBeTruthy()
  })

  it('flushes the trailing SSE payload when the response closes without a final newline', async () => {
    const payload = `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}`
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload))
        controller.close()
      },
    })

    const received: Array<Record<string, unknown>> = []
    await stream
      .pipeThrough(createSseChunkTransform())
      .pipeTo(new WritableStream({
        write(chunk) {
          received.push(chunk as Record<string, unknown>)
        },
      }))

    expect(received).toHaveLength(1)
    expect(received[0]?.choices).toBeTruthy()
  })

  it('finishes the manual tool loop even when the HTTP transport stays open after [DONE]', async () => {
    const mockFetch = vi.fn(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(sseChunk({ choices: [{ delta: { content: 'Hello' }, finish_reason: null }] }))
          controller.enqueue(sseChunk({ choices: [{ delta: {}, finish_reason: 'stop' }] }))
          controller.enqueue(doneChunk())
          // NOTICE: Keep the transport open on purpose. GitHub Models has done
          // this intermittently in practice, and the manual loop must still
          // finish once `[DONE]` is observed.
        },
      })

      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    })

    const events: string[] = []
    await runManualToolLoop({
      chatProvider: createChatProvider(mockFetch),
      maxSteps: 3,
      messages: [{ role: 'user', content: 'say hello' }],
      model: 'gpt-4.1',
      tools: [],
      promptContentMode: 'default',
      onStreamEvent: async (event) => { events.push(event.type) },
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(events).toContain('finish')
  })

  it('aborts the manual tool loop when the abort signal fires mid-stream', async () => {
    const abortController = new AbortController()
    const mockFetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(sseChunk({ choices: [{ delta: { content: 'Hello' }, finish_reason: null }] }))

          init?.signal?.addEventListener('abort', () => {
            controller.error(init.signal?.reason ?? new DOMException('Aborted', 'AbortError'))
          }, { once: true })
        },
      })

      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    })

    const loopPromise = runManualToolLoop({
      abortSignal: abortController.signal,
      chatProvider: createChatProvider(mockFetch),
      maxSteps: 3,
      messages: [{ role: 'user', content: 'say hello' }],
      model: 'gpt-4.1',
      tools: [],
      promptContentMode: 'default',
    })

    abortController.abort(new DOMException('Stopped by test', 'AbortError'))

    await expect(loopPromise).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})
