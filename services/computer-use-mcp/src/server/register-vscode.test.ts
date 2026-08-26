import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ComputerUseServerRuntime } from './runtime'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RunStateManager } from '../state'
import { createTestConfig } from '../test-fixtures'
import { registerVscodeTools } from './register-vscode'

type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>

function createMockServer() {
  const handlers = new Map<string, ToolHandler>()

  return {
    server: {
      tool(name: string, _schema: unknown, handler: ToolHandler) {
        handlers.set(name, handler)
      },
    } as unknown as McpServer,
    async invoke(name: string, args: Record<string, unknown> = {}) {
      const handler = handlers.get(name)
      if (!handler) {
        throw new Error(`Missing registered tool: ${name}`)
      }

      return await handler(args)
    },
  }
}

function createExecutedTerminalResult(overrides: {
  command: string
  stdout?: string
  stderr?: string
  exitCode?: number
  effectiveCwd?: string
  durationMs?: number
  timedOut?: boolean
}): CallToolResult {
  return {
    content: [{ type: 'text', text: 'terminal ok' }],
    structuredContent: {
      status: 'executed',
      backendResult: {
        command: overrides.command,
        stdout: overrides.stdout ?? '',
        stderr: overrides.stderr ?? '',
        exitCode: overrides.exitCode ?? 0,
        effectiveCwd: overrides.effectiveCwd ?? '/tmp',
        durationMs: overrides.durationMs ?? 25,
        timedOut: overrides.timedOut ?? false,
      },
    },
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
    const { server, invoke } = createMockServer()

    registerVscodeTools({ server, runtime, executeTerminalCommand })

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
      content: [{ type: 'text', text: 'approval required' }],
      structuredContent: {
        status: 'approval_required',
        pendingActionId: 'pending-1',
      },
    }
    const executeTerminalCommand = vi.fn().mockResolvedValue(approvalRequired)
    const { server, invoke } = createMockServer()

    registerVscodeTools({ server, runtime, executeTerminalCommand })

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
      exitCode: 1,
      effectiveCwd: '/tmp/project',
      stdout: [
        'src/main.ts(10,5): error TS2345: Type "number" is not assignable to type "string".',
        'src/App.vue:12:3 - warning TS6133: "unused" is declared but its value is never read.',
      ].join('\n'),
    }))
    const { server, invoke } = createMockServer()

    registerVscodeTools({ server, runtime, executeTerminalCommand })

    const result = await invoke('vscode_list_problems', {
      cwd: '/tmp/project',
    })

    const structured = result.structuredContent as Record<string, any>
    expect(structured.status).toBe('has_problems')
    expect(structured.problemCount).toBe(2)
    expect(structured.problems).toEqual([
      {
        file: 'src/main.ts',
        line: 10,
        column: 5,
        severity: 'error',
        code: 'TS2345',
        message: 'Type "number" is not assignable to type "string".',
      },
      {
        file: 'src/App.vue',
        line: 12,
        column: 3,
        severity: 'warning',
        code: 'TS6133',
        message: '"unused" is declared but its value is never read.',
      },
    ])
    expect(runtime.stateManager.getState().vscode).toMatchObject({
      lastTask: {
        command: 'pnpm typecheck 2>&1',
        cwd: '/tmp/project',
        exitCode: 1,
      },
      lastProblems: {
        command: 'pnpm typecheck 2>&1',
        cwd: '/tmp/project',
        problemCount: 2,
      },
    })
  })
})
