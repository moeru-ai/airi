import type { RunnerClient } from '@auv-js/sdk/node'

import type { AuvExecutorRuntime, AuvSession } from '../executors/auv-runtime'
import type { ComputerUseConfig, WindowInfo } from '../types'
import type { ComputerUseServerRuntime } from './runtime'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { describe, expect, it, vi } from 'vitest'

import { createAuvExecutor } from '../executors/auv'
import { AuvExecutorError } from '../executors/auv-errors'
import { createDryRunExecutor } from '../executors/dry-run'
import { ComputerUseSession } from '../session'
import { RunStateManager } from '../state'
import { TaskMemoryManager } from '../task-memory/manager'
import { createLocalShellRunner } from '../terminal/runner'
import { createTestConfig } from '../test-fixtures'
import { createExecuteAction } from './action-executor'
import { registerComputerUseTools } from './register-tools'

function asCast<T>(value: unknown): T {
  return value as T
}

function createMockAuvSession(runnerOverrides: Record<string, unknown> = {}): AuvSession {
  const runner = asCast<RunnerClient>({
    windows: {
      list: vi.fn().mockResolvedValue([]),
      resolve: vi.fn().mockResolvedValue(undefined),
    },
    displays: {
      list: vi.fn().mockResolvedValue([]),
    },
    ...runnerOverrides,
  })

  return {
    runner,
    runId: 'auv-mcp-test-run',
    deviceId: 'auv-mcp-test-device',
    daemonId: 'auv-mcp-test-daemon',
  }
}

function createMockRuntime(session?: AuvSession, options?: { failEnsure?: boolean }): AuvExecutorRuntime {
  return {
    ensureSession: options?.failEnsure
      ? vi.fn().mockRejectedValue(new AuvExecutorError('unavailable', 'auv binary not found or failed to start'))
      : vi.fn().mockResolvedValue(session ?? createMockAuvSession()),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

async function createMcpTestHarness(options: {
  configOverrides?: Partial<ComputerUseConfig>
  auvRuntime?: AuvExecutorRuntime
} = {}) {
  const config = createTestConfig({
    executor: 'auv',
    approvalMode: 'never',
    ...options.configOverrides,
  })

  const auvRuntime = options.auvRuntime ?? createMockRuntime()
  const executor = config.executor === 'dry-run'
    ? createDryRunExecutor(config)
    : createAuvExecutor(config, { runtime: auvRuntime })
  const stateManager = new RunStateManager()
  const session = new ComputerUseSession(config)
  await session.init()

  const terminalRunner = createLocalShellRunner(config)
  session.setTerminalState(terminalRunner.getState())
  stateManager.updateTerminalState(terminalRunner.getState())

  const runtime = asCast<ComputerUseServerRuntime>({
    config,
    session,
    executor,
    terminalRunner,
    browserDomBridge: {
      getStatus: () => ({ connected: false, host: '127.0.0.1', port: 8765 }),
      close: vi.fn().mockResolvedValue(undefined),
    },
    cdpBridgeManager: {
      probeAvailability: vi.fn().mockResolvedValue({ connected: false, connectable: false }),
      close: vi.fn().mockResolvedValue(undefined),
    },
    stateManager,
    taskMemory: new TaskMemoryManager(),
    chromeSessionManager: {
      getSession: () => null,
      close: vi.fn().mockResolvedValue(undefined),
    },
    desktopSessionController: {
      getSession: () => null,
      ensureControlledAppInForeground: vi.fn().mockResolvedValue(true),
      touch: vi.fn(),
    },
  })

  const executeAction = createExecuteAction(runtime)
  const server = new McpServer({
    name: 'AIRI Computer Use Test Server',
    version: '0.1.0',
  })

  registerComputerUseTools({
    server,
    runtime,
    executeAction,
    enableTestTools: false,
  })

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test-mcp-client', version: '1.0.0' }, { capabilities: {} })

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ])

  return {
    client,
    server,
    runtime,
    stateManager,
    session,
    executor,
    cleanup: async () => {
      await client.close()
      await server.close()
    },
  }
}

describe('mcp entry-level integration: AUV windows observation and terminal independence', () => {
  it('executes desktop_observe_windows end-to-end via MCP client and updates runtime state', async () => {
    const mockWindows = [
      {
        id: 'win-vscode',
        window: {
          title: 'src/server.ts - airi',
          applicationName: 'Visual Studio Code',
          processId: 4321,
          frame: { x: 100, y: 100, width: 1200, height: 800 },
          isVisible: true,
        },
      },
      {
        id: 'win-calc',
        window: {
          title: 'Calculator',
          applicationName: 'CalculatorApp',
          processId: 8765,
          frame: { x: 50, y: 50, width: 400, height: 500 },
          isVisible: true,
        },
      },
    ]

    const auvSession = createMockAuvSession({
      windows: asCast<RunnerClient['windows']>({
        list: vi.fn().mockResolvedValue(mockWindows),
        resolve: vi.fn().mockResolvedValue(mockWindows[0]),
      }),
    })

    const harness = await createMcpTestHarness({
      auvRuntime: createMockRuntime(auvSession),
    })

    try {
      const result = await harness.client.callTool({
        name: 'desktop_observe_windows',
        arguments: { limit: 10 },
      })

      expect(result.isError).toBeFalsy()
      const structuredContent = asCast<{
        status: string
        backendResult: {
          observation: {
            windows: WindowInfo[]
            frontmostAppName?: string
            frontmostWindowTitle?: string
          }
        }
      }>(result.structuredContent)

      expect(structuredContent.status).toBe('executed')
      expect(structuredContent.backendResult.observation.windows).toHaveLength(2)
      expect(structuredContent.backendResult.observation.windows[0]?.appName).toBe('Visual Studio Code')
      expect(structuredContent.backendResult.observation.windows[0]?.ownerPid).toBe(4321)
      expect(structuredContent.backendResult.observation.windows[0]?.bounds).toEqual({ x: 100, y: 100, width: 1200, height: 800 })
      expect(structuredContent.backendResult.observation.frontmostAppName).toBe('Visual Studio Code')
      expect(structuredContent.backendResult.observation.frontmostWindowTitle).toBe('src/server.ts - airi')

      // Verify RunStateManager was updated
      const recorded = harness.stateManager.getState().lastWindowObservation
      expect(recorded).toBeDefined()
      expect(recorded?.windows).toHaveLength(2)
      expect(recorded?.windows[0]?.appName).toBe('Visual Studio Code')
    }
    finally {
      await harness.cleanup()
    }
  })

  it('queries desktop_get_capabilities and accurately reports read-only AUV support', async () => {
    const harness = await createMcpTestHarness()

    try {
      const result = await harness.client.callTool({
        name: 'desktop_get_capabilities',
        arguments: {},
      })

      expect(result.isError).toBeFalsy()
      const structuredContent = asCast<{
        windowAutomation: string
        supportedAppsForOpenFocus: string[]
        executor: { kind: string }
      }>(result.structuredContent)

      expect(structuredContent.executor.kind).toBe('auv')
      expect(structuredContent.windowAutomation).toBe('auv runner.windows (read-only window observation)')
      expect(structuredContent.supportedAppsForOpenFocus).toEqual([])
    }
    finally {
      await harness.cleanup()
    }
  })

  it('fails closed when mutating tools are invoked under AUV executor', async () => {
    const harness = await createMcpTestHarness()

    try {
      // desktop_click
      const clickResult = await harness.client.callTool({
        name: 'desktop_click',
        arguments: { x: 500, y: 500 },
      })
      expect(clickResult.isError).toBe(true)

      // desktop_type_text
      const typeResult = await harness.client.callTool({
        name: 'desktop_type_text',
        arguments: { text: 'hello world' },
      })
      expect(typeResult.isError).toBe(true)

      // desktop_open_app
      const openResult = await harness.client.callTool({
        name: 'desktop_open_app',
        arguments: { app: 'Calculator' },
      })
      expect(openResult.isError).toBe(true)
    }
    finally {
      await harness.cleanup()
    }
  })

  it('returns structured error via MCP when AUV binary is missing or fails to start without crashing', async () => {
    const failingRuntime = createMockRuntime(undefined, { failEnsure: true })
    const harness = await createMcpTestHarness({ auvRuntime: failingRuntime })

    try {
      const result = await harness.client.callTool({
        name: 'desktop_observe_windows',
        arguments: {},
      })

      expect(result.isError).toBe(true)
      const text = asCast<{ text?: string }[]>(result.content)[0]?.text || ''
      expect(text).toMatch(/auv binary not found|observe windows failed/i)
    }
    finally {
      await harness.cleanup()
    }
  })

  it('keeps terminal execution fully operational on Windows even when AUV desktop runtime is unavailable', async () => {
    const failingRuntime = createMockRuntime(undefined, { failEnsure: true })
    const harness = await createMcpTestHarness({ auvRuntime: failingRuntime })

    try {
      // Execute terminal command through MCP tool
      const termResult = await harness.client.callTool({
        name: 'terminal_exec',
        arguments: { command: 'Write-Output "terminal-is-healthy"' },
      })

      expect(termResult.isError).toBeFalsy()
      const structuredContent = asCast<{
        status: string
        backendResult: {
          exitCode: number
          stdout: string
        }
      }>(resultToRecord(termResult))

      expect(structuredContent.status).toBe('executed')
      expect(structuredContent.backendResult.exitCode).toBe(0)
      expect(structuredContent.backendResult.stdout).toContain('terminal-is-healthy')
    }
    finally {
      await harness.cleanup()
    }
  })

  it('respects explicit dry-run executor override', async () => {
    const harness = await createMcpTestHarness({
      configOverrides: { executor: 'dry-run' },
    })

    try {
      const capResult = await harness.client.callTool({
        name: 'desktop_get_capabilities',
        arguments: {},
      })

      expect(capResult.isError).toBeFalsy()
      const structuredContent = asCast<{
        executor: { kind: string }
        windowAutomation: string
      }>(capResult.structuredContent)

      expect(structuredContent.executor.kind).toBe('dry-run')
      expect(structuredContent.windowAutomation).toBe('dry-run')
    }
    finally {
      await harness.cleanup()
    }
  })
})

function resultToRecord(result: unknown): Record<string, unknown> {
  const rec = asCast<{ structuredContent?: Record<string, unknown> }>(result)
  return rec.structuredContent || {}
}
