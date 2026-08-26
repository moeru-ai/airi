import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ComputerUseServerRuntime } from './runtime'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RunStateManager } from '../state'
import { createTestConfig } from '../test-fixtures'
import { registerVscodeTools } from './register-vscode'

type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>

function createExecutedTerminalResult(overrides: {
  command: string
  durationMs?: number
  effectiveCwd?: string
  exitCode?: number
  stderr?: string
  stdout?: string
  timedOut?: boolean
}): CallToolResult {
  return {
    content: [{ text: 'terminal ok', type: 'text' }],
    structuredContent: {
      backendResult: {
        command: overrides.command,
        durationMs: overrides.durationMs ?? 25,
        effectiveCwd: overrides.effectiveCwd ?? '/tmp',
        exitCode: overrides.exitCode ?? 0,
        stderr: overrides.stderr ?? '',
        stdout: overrides.stdout ?? '',
        timedOut: overrides.timedOut ?? false,
      },
      status: 'executed',
    },
  }
}

function createMockServer() {
  const handlers = new Map<string, ToolHandler>()

  return {
    async invoke(name: string, args: Record<string, unknown> = {}) {
      const handler = handlers.get(name)
      if (!handler) {
        throw new Error(`Missing registered tool: ${name}`)
      }

      return await handler(args)
    },
    server: {
      tool(name: string, _schema: unknown, handler: ToolHandler) {
        handlers.set(name, handler)
      },
    } as unknown as McpServer,
  }
}

describe('registerVscodeTools', () => {
  let runtime: ComputerUseServerRuntime

  beforeEach(() => {
    runtime = {
      config: createTestConfig(),
      stateManager: new RunStateManager(),
    } as unknown as ComputerUseServerRuntime
  })

  it('opens workspaces through the standard terminal_exec chain and updates run-state', async () => {
    const executeTerminalCommand = vi.fn()
      .mockResolvedValueOnce(createExecutedTerminalResult({
        command: 'which code',
        stdout: '/usr/local/bin/code\n',
      }))
      .mockResolvedValueOnce(createExecutedTerminalResult({
        command: 'code --reuse-window "/tmp/project"',
        effectiveCwd: '/tmp/project',
      }))
    const { invoke, server } = createMockServer()

    registerVscodeTools({ executeTerminalCommand, runtime, server })

    const result = await invoke('vscode_open_workspace', {
      folderPath: '/tmp/project',
      reuseWindow: true,
    })

    expect(executeTerminalCommand).toHaveBeenNthCalledWith(1, {
      command: 'which code',
      timeoutMs: 5_000,
    }, 'vscode_resolve_code_cli_probe_code')
    expect(executeTerminalCommand).toHaveBeenNthCalledWith(2, {
      command: 'code --reuse-window "/tmp/project"',
      timeoutMs: 15_000,
    }, 'vscode_open_workspace')
    expect((result.structuredContent as Record<string, unknown>).status).toBe('ok')
    expect(runtime.stateManager.getState().vscode).toMatchObject({
      codeCli: {
        cli: 'code',
        path: '/usr/local/bin/code',
      },
      workspacePath: '/tmp/project',
    })
  })

  it('passes approval_required responses through instead of bypassing the terminal pipeline', async () => {
    const approvalRequired: CallToolResult = {
      content: [{ text: 'approval required', type: 'text' }],
      structuredContent: {
        pendingActionId: 'pending-1',
        status: 'approval_required',
      },
    }
    const executeTerminalCommand = vi.fn().mockResolvedValue(approvalRequired)
    const { invoke, server } = createMockServer()

    registerVscodeTools({ executeTerminalCommand, runtime, server })

    const result = await invoke('vscode_run_task', {
      command: 'pnpm test',
      cwd: '/tmp/project',
    })

    expect(executeTerminalCommand).toHaveBeenCalledWith({
      command: 'pnpm test',
      cwd: '/tmp/project',
      timeoutMs: 60_000,
    }, 'vscode_run_task')
    expect(result).toBe(approvalRequired)
    expect(runtime.stateManager.getState().vscode).toBeUndefined()
  })

  it('parses problem output and writes diagnostics into run-state', async () => {
    const executeTerminalCommand = vi.fn().mockResolvedValue(createExecutedTerminalResult({
      command: 'pnpm typecheck 2>&1',
      effectiveCwd: '/tmp/project',
      exitCode: 1,
      stdout: [
        'src/main.ts(10,5): error TS2345: Type "number" is not assignable to type "string".',
        'src/App.vue:12:3 - warning TS6133: "unused" is declared but its value is never read.',
      ].join('\n'),
    }))
    const { invoke, server } = createMockServer()

    registerVscodeTools({ executeTerminalCommand, runtime, server })

    const result = await invoke('vscode_list_problems', {
      cwd: '/tmp/project',
    })

    const structured = result.structuredContent as Record<string, any>
    expect(structured.status).toBe('has_problems')
    expect(structured.problemCount).toBe(2)
    expect(structured.problems).toEqual([
      {
        code: 'TS2345',
        column: 5,
        file: 'src/main.ts',
        line: 10,
        message: 'Type "number" is not assignable to type "string".',
        severity: 'error',
      },
      {
        code: 'TS6133',
        column: 3,
        file: 'src/App.vue',
        line: 12,
        message: '"unused" is declared but its value is never read.',
        severity: 'warning',
      },
    ])
    expect(runtime.stateManager.getState().vscode).toMatchObject({
      lastProblems: {
        command: 'pnpm typecheck 2>&1',
        cwd: '/tmp/project',
        problemCount: 2,
      },
      lastTask: {
        command: 'pnpm typecheck 2>&1',
        cwd: '/tmp/project',
        exitCode: 1,
      },
    })
  })
})
