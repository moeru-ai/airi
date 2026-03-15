import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ComputerUseServerRuntime } from './runtime'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CodingPrimitives } from '../coding/primitives'
import { buildCodingApplyPatchBackendResult } from '../coding/result-shape'
import { RunStateManager } from '../state'
import { createTestConfig } from '../test-fixtures'
import { registerCodingTools } from './register-coding'

type ToolHandler = (args: Record<string, unknown>) => Promise<CallToolResult>

function createMockServer() {
  const handlers = new Map<string, ToolHandler>()

  return {
    server: {
      tool(...args: unknown[]) {
        const name = args[0] as string
        const handler = args[args.length - 1] as ToolHandler
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

describe('registerCodingTools', () => {
  let runtime: ComputerUseServerRuntime

  beforeEach(() => {
    runtime = {
      config: createTestConfig(),
      stateManager: new RunStateManager(),
    } as unknown as ComputerUseServerRuntime
    vi.restoreAllMocks()
  })

  it('emits structuredContent for coding_read_file with the shared backendResult shape', async () => {
    vi.spyOn(CodingPrimitives.prototype, 'readFile').mockResolvedValue('line 1\nline 2')
    const { server, invoke } = createMockServer()

    registerCodingTools({
      server,
      runtime,
      executeAction: vi.fn() as any,
      enableTestTools: false,
    })

    const result = await invoke('coding_read_file', {
      filePath: 'src/example.ts',
      startLine: 1,
      endLine: 2,
    })

    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'Read src/example.ts.',
    })
    expect(result.structuredContent).toMatchObject({
      status: 'ok',
      kind: 'coding_result',
      toolName: 'coding_read_file',
      backendResult: {
        file: 'src/example.ts',
        length: 'line 1\nline 2'.length,
        content: 'line 1\nline 2',
        range: {
          startLine: 1,
          endLine: 2,
        },
      },
    })
  })

  it('emits structuredContent for coding_report_status instead of text-only JSON', async () => {
    vi.spyOn(CodingPrimitives.prototype, 'reportStatus').mockResolvedValue({
      status: 'completed',
      summary: 'Applied edits and validated.',
      filesTouched: ['src/example.ts'],
      commandsRun: ['pnpm test'],
      checks: ['Exit Code: 0'],
      nextStep: 'Await the next instruction.',
    })
    const { server, invoke } = createMockServer()

    registerCodingTools({
      server,
      runtime,
      executeAction: vi.fn() as any,
      enableTestTools: false,
    })

    const result = await invoke('coding_report_status', {
      status: 'auto',
      summary: 'auto',
      filesTouched: ['auto'],
      commandsRun: ['auto'],
      checks: ['auto'],
      nextStep: 'auto',
    })

    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'Reported coding status: completed.',
    })
    expect(result.structuredContent).toMatchObject({
      status: 'ok',
      kind: 'coding_result',
      toolName: 'coding_report_status',
      backendResult: {
        status: 'completed',
        summary: 'Applied edits and validated.',
      },
    })
  })

  it('routes coding_apply_patch through executeAction so approval policy is preserved', async () => {
    const executeAction = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Approval required for coding_apply_patch.' }],
      structuredContent: {
        status: 'approval_required',
        pendingActionId: 'pending_1',
      },
    } satisfies CallToolResult)
    const applyPatchSpy = vi.spyOn(CodingPrimitives.prototype, 'applyPatch')
    const { server, invoke } = createMockServer()

    registerCodingTools({
      server,
      runtime,
      executeAction: executeAction as any,
      enableTestTools: false,
    })

    const result = await invoke('coding_apply_patch', {
      filePath: 'src/example.ts',
      oldString: 'before',
      newString: 'after',
    })

    expect(executeAction).toHaveBeenCalledWith({
      kind: 'coding_apply_patch',
      input: {
        filePath: 'src/example.ts',
        oldString: 'before',
        newString: 'after',
      },
    }, 'coding_apply_patch')
    expect(applyPatchSpy).not.toHaveBeenCalled()
    expect(result.structuredContent).toMatchObject({
      status: 'approval_required',
      pendingActionId: 'pending_1',
    })
  })

  it('re-wraps executed coding_apply_patch results into the coding result shape', async () => {
    const executeAction = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Action executed.' }],
      structuredContent: {
        status: 'executed',
        backendResult: buildCodingApplyPatchBackendResult({
          filePath: 'src/example.ts',
          summary: 'Replaced 1 occurrence in src/example.ts',
        }),
      },
    } satisfies CallToolResult)
    const { server, invoke } = createMockServer()

    registerCodingTools({
      server,
      runtime,
      executeAction: executeAction as any,
      enableTestTools: false,
    })

    const result = await invoke('coding_apply_patch', {
      filePath: 'src/example.ts',
      oldString: 'before',
      newString: 'after',
    })

    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'Patched src/example.ts.',
    })
    expect(result.structuredContent).toMatchObject({
      status: 'ok',
      kind: 'coding_result',
      toolName: 'coding_apply_patch',
      backendResult: {
        file: 'src/example.ts',
      },
    })
  })
})
