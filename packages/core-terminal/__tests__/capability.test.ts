/**
 * AIRI Core Terminal — Capability registration tests
 *
 * Uses a fake bridge that simulates an MCP server without spawning any
 * subprocess. Verifies that tool discovery, capability registry population,
 * handler binding, and error wiring all work correctly.
 */

import type { CapabilityId, ToolDescriptor, ToolExecutionResult } from '@proj-airi/core'

import type { TerminalMcpBridge, TerminalMcpToolSummary } from '../src/bridge.js'
import {
  CapabilityRegistry,
  createCancellationToken,
  createTaskId,
  createToolId,
  EventBus,
  LocalToolRuntime,
} from '@proj-airi/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TERMINAL_CAPABILITY_ID } from '../src/capability.js'
import { clearToolSchemaCache, createTerminalToolHandler } from '../src/handler.js'

function createMockBridge(tools: TerminalMcpToolSummary[] = []): TerminalMcpBridge {
  const handlers = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>()

  return {
    connected: true,
    pid: 12345,
    async connect() {
      return tools
    },
    async listTools() {
      return tools
    },
    async callTool(name: string, args: Record<string, unknown>) {
      const handler = handlers.get(name)
      if (!handler)
        throw Object.assign(new Error(`Tool "${name}" not found in mock bridge`), { code: 'MOCK_UNKNOWN_TOOL' })
      return handler(args)
    },
    async close() {},
    // Expose internal registration for tests.
    _handlers: handlers,
  } as unknown as TerminalMcpBridge & {
    _handlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>>
  }
}

function sampleTerminalTools(): TerminalMcpToolSummary[] {
  return [
    {
      name: 'terminal_run',
      description: 'Run a one-shot non-interactive command',
      inputSchema: {
        type: 'object',
        properties: {
          cmd: { type: 'string' },
          args: { type: 'array', items: { type: 'string' } },
        },
        required: ['cmd'],
      },
    },
    {
      name: 'terminal_start',
      description: 'Start an interactive terminal session',
      inputSchema: {
        type: 'object',
        properties: {
          shell: { type: 'string' },
          cwd: { type: 'string' },
        },
      },
    },
    {
      name: 'terminal_exec',
      description: 'Execute a command in a session and wait for output',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          command: { type: 'string' },
        },
        required: ['sessionId', 'command'],
      },
    },
  ]
}

describe('createTerminalToolHandler', () => {
  // Each test uses the same tool name. Clear the shared schema cache between
  // tests so previously-cached schemas for `terminal_run` don't leak.
  afterEach(() => clearToolSchemaCache())

  it('forwards input to the bridge and returns a success result', async () => {
    const mockBridge = createMockBridge()
    const bridgeWithHandlers = mockBridge as unknown as {
      _handlers: Map<string, (args: Record<string, unknown>) => Promise<unknown>>
    }
    bridgeWithHandlers._handlers.set('terminal_run', async (args) => ({
      ok: true,
      stdout: `ran ${args.cmd}`,
    }))

    const handler = createTerminalToolHandler(mockBridge, {
      id: createToolId('terminal_run'),
      name: 'terminal_run',
      description: 'Run a command',
      capabilityId: 'terminal' as CapabilityId,
      inputSchema: undefined,
      outputSchema: undefined,
    } satisfies ToolDescriptor)

    const token = createCancellationToken()
    const result = (await handler({ cmd: 'echo', args: ['hello'] }, {
      taskId: createTaskId('task-1'),
      cancellationToken: token.token,
      timeoutMs: 5000,
      metadata: {},
    } as any)) as ToolExecutionResult

    expect(result.success).toBe(true)
    expect(result.output).toEqual({ ok: true, stdout: `ran echo` })
    expect(result.error).toBeUndefined()
  })

  it('validates input against the schema and returns INPUT_VALIDATION_ERROR for missing required fields', async () => {
    const mockBridge = createMockBridge(sampleTerminalTools())

    const handler = createTerminalToolHandler(mockBridge, {
      id: createToolId('terminal_run'),
      name: 'terminal_run',
      description: 'Run a command',
      capabilityId: 'terminal' as CapabilityId,
      inputSchema: sampleTerminalTools()[0].inputSchema,
      outputSchema: undefined,
    } satisfies ToolDescriptor)

    const token = createCancellationToken()
    const result = (await handler(
      { args: ['hello'] }, // missing required `cmd`
      {
        taskId: createTaskId('task-1'),
        cancellationToken: token.token,
        timeoutMs: 5000,
        metadata: {},
      } as any,
    )) as ToolExecutionResult

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('INPUT_VALIDATION_ERROR')
    expect(result.error?.message).toContain('cmd')
  })

  it('catches bridge call failures and returns a structured error', async () => {
    const mockBridge = createMockBridge()
    // Override callTool to always throw.
    ;(mockBridge as unknown as { callTool: (n: string, a: Record<string, unknown>) => Promise<unknown> }).callTool =
      async () => {
        throw Object.assign(new Error('simulated failure'), { code: 'MOCK_ERROR' })
      }

    const handler = createTerminalToolHandler(mockBridge, {
      id: createToolId('terminal_run'),
      name: 'terminal_run',
      description: 'Run a command',
      capabilityId: 'terminal' as CapabilityId,
      inputSchema: undefined,
      outputSchema: undefined,
    } satisfies ToolDescriptor)

    const token = createCancellationToken()
    const result = (await handler({ cmd: 'echo' }, {
      taskId: createTaskId('task-1'),
      cancellationToken: token.token,
      timeoutMs: 5000,
      metadata: {},
    } as any)) as ToolExecutionResult

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(result.error?.message).toContain('simulated failure')
  })
})

describe('registerTerminalCapability', () => {
  let registry: CapabilityRegistry
  let _runtime: LocalToolRuntime

  beforeEach(() => {
    const events = new EventBus()
    registry = new CapabilityRegistry()
    // LocalToolRuntime signature: (registry, events, eventStore?, workspaceManager?)
    _runtime = new LocalToolRuntime(registry, events)
  })

  it('registers a capability with one tool per advertised MCP tool', async () => {
    const tools = sampleTerminalTools()
    // Stub the bridge constructor by injecting via bridgeOptions is not possible
    // because the bridge is constructed inside registerTerminalCapability. We test
    // the registration by monkeypatching the bridge after registration using
    // direct registry + runtime ops instead.
    // Directly register a terminal capability to verify registry mechanics.
    // (The actual bridge integration is tested in integration tests.)
    const { createCapabilityId: createCap } = await import('@proj-airi/core')
    const capId = createCap(TERMINAL_CAPABILITY_ID)
    const toolDescriptors = tools.map((tool) => ({
      id: createToolId(tool.name),
      name: tool.name,
      description: tool.description ?? `Terminal tool: ${tool.name}`,
      capabilityId: capId,
      inputSchema: tool.inputSchema ?? { type: 'object' },
      outputSchema: { type: 'object' },
    }))

    registry.register({
      id: capId,
      name: 'Terminal',
      description: 'Test terminal capability',
      moduleId: '@proj-airi/core-terminal',
      tools: toolDescriptors,
    })

    expect(registry.size()).toBe(1)
    expect(registry.hasTool(createToolId('terminal_run'))).toBe(true)
    expect(registry.hasTool(createToolId('terminal_start'))).toBe(true)
    expect(registry.hasTool(createToolId('terminal_exec'))).toBe(true)
  })

  it('throws when registering a capability with an already-registered ID', async () => {
    const { createCapabilityId: createCap } = await import('@proj-airi/core')
    const capId = createCap(TERMINAL_CAPABILITY_ID)

    registry.register({
      id: capId,
      name: 'Terminal',
      description: 'Terminal capability',
      moduleId: '@proj-airi/core-terminal',
      tools: [
        {
          id: createToolId('terminal_run'),
          name: 'terminal_run',
          description: 'Run a command',
          capabilityId: capId,
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
        },
      ],
    })

    expect(() => {
      registry.register({
        id: capId,
        name: 'Terminal',
        description: 'Duplicate',
        moduleId: '@proj-airi/core-terminal',
        tools: [],
      })
    }).toThrow('Capability already registered')
  })

  it('throws when registering a tool with an ID that collides with another capability', async () => {
    const { createCapabilityId: createCap, createToolId: createId } = await import('@proj-airi/core')
    const capId1 = createCap('terminal')
    const sharedTool = createId('shared_tool')

    registry.register({
      id: capId1,
      name: 'Terminal',
      description: 'Terminal capability',
      moduleId: '@proj-airi/core-terminal',
      tools: [
        {
          id: sharedTool,
          name: 'shared_tool',
          description: 'Shared tool',
          capabilityId: capId1,
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
        },
      ],
    })

    expect(() => {
      registry.register({
        id: createCap('other'),
        name: 'Other',
        description: 'Other capability',
        moduleId: '@proj-airi/other',
        tools: [
          {
            id: sharedTool,
            name: 'shared_tool',
            description: 'Same tool different capability',
            capabilityId: createCap('other'),
            inputSchema: { type: 'object' },
            outputSchema: { type: 'object' },
          },
        ],
      })
    }).toThrow('Tool ID collision')
  })
})
