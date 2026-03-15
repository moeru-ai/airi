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

  it('registers coding_search_text and returns structured search payload', async () => {
    vi.spyOn(CodingPrimitives.prototype, 'searchText').mockResolvedValue({
      total: 1,
      matches: [{ file: 'src/example.ts', line: 3, column: 2, snippet: 'needle()' }],
    })
    const { server, invoke } = createMockServer()

    registerCodingTools({
      server,
      runtime,
      executeAction: vi.fn() as any,
      enableTestTools: false,
    })

    const result = await invoke('coding_search_text', {
      query: 'needle',
      limit: 5,
    })

    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'Searched text with 1 match(es).',
    })
    expect(result.structuredContent).toMatchObject({
      status: 'ok',
      kind: 'coding_result',
      toolName: 'coding_search_text',
      backendResult: {
        total: 1,
      },
    })
  })

  it('registers coding_find_references and returns structured references payload', async () => {
    vi.spyOn(CodingPrimitives.prototype, 'findReferences').mockResolvedValue({
      engine: 'typescript',
      engineDescriptor: {
        id: 'typescript',
        capabilities: {
          definition: true,
          reference: true,
          impact: false,
        },
        supportedExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'],
      },
      capabilities: {
        definition: true,
        reference: true,
        impact: false,
      },
      unsupportedReason: null,
      requestedCapability: 'reference',
      filePath: 'src/example.ts',
      targetLine: 12,
      targetColumn: 7,
      total: 2,
      limit: 10,
      matches: [
        { file: 'src/example.ts', line: 12, column: 7, isWriteAccess: false },
        { file: 'src/other.ts', line: 19, column: 11, isWriteAccess: true },
      ],
    })
    const { server, invoke } = createMockServer()

    registerCodingTools({
      server,
      runtime,
      executeAction: vi.fn() as any,
      enableTestTools: false,
    })

    const result = await invoke('coding_find_references', {
      filePath: 'src/example.ts',
      targetLine: 12,
      targetColumn: 7,
      limit: 10,
    })

    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'Found references: 2.',
    })
    expect(result.structuredContent).toMatchObject({
      status: 'ok',
      kind: 'coding_result',
      toolName: 'coding_find_references',
      backendResult: {
        filePath: 'src/example.ts',
        total: 2,
      },
    })
  })

  it('registers coding_select_target and returns structured selection payload', async () => {
    vi.spyOn(CodingPrimitives.prototype, 'selectTarget').mockResolvedValue({
      status: 'selected',
      selectedFile: 'src/example.ts',
      candidates: [{
        filePath: 'src/example.ts',
        sourceKind: 'symbol',
        sourceLabel: 'symbol:example',
        score: 300,
        matchCount: 1,
        inScopedPath: false,
        recentlyEdited: false,
        recentlyRead: false,
        reasons: ['source=symbol(300)'],
      }],
      reason: 'Selected deterministically.',
      recommendedNextAction: 'Proceed with auto.',
    } as any)

    const { server, invoke } = createMockServer()
    registerCodingTools({
      server,
      runtime,
      executeAction: vi.fn() as any,
      enableTestTools: false,
    })

    const result = await invoke('coding_select_target', {
      searchQuery: 'example',
    })

    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'Target selection: selected.',
    })
    expect(result.structuredContent).toMatchObject({
      status: 'ok',
      kind: 'coding_result',
      toolName: 'coding_select_target',
      backendResult: {
        status: 'selected',
        selectedFile: 'src/example.ts',
      },
    })
  })

  it('registers coding_plan_changes and returns structured plan payload', async () => {
    vi.spyOn(CodingPrimitives.prototype, 'planChanges').mockResolvedValue({
      maxPlannedFiles: 2,
      diffBaselineFiles: ['README.md'],
      reason: 'Planned 2 file(s).',
      steps: [
        { filePath: 'src/a.ts', intent: 'Refactor', source: 'target_selection', status: 'pending' },
        { filePath: 'src/b.ts', intent: 'Refactor', source: 'search', status: 'pending' },
      ],
    } as any)

    const { server, invoke } = createMockServer()
    registerCodingTools({
      server,
      runtime,
      executeAction: vi.fn() as any,
      enableTestTools: false,
    })

    const result = await invoke('coding_plan_changes', {
      intent: 'Refactor',
      allowMultiFile: true,
      maxPlannedFiles: 2,
    })

    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'Planned 2 file change step(s).',
    })
    expect(result.structuredContent).toMatchObject({
      status: 'ok',
      kind: 'coding_result',
      toolName: 'coding_plan_changes',
      backendResult: {
        maxPlannedFiles: 2,
      },
    })
  })

  it('registers coding_review_changes and returns structured review payload', async () => {
    vi.spyOn(CodingPrimitives.prototype, 'reviewChanges').mockResolvedValue({
      status: 'needs_follow_up',
      filesReviewed: ['src/a.ts'],
      diffSummary: '1 file changed',
      validationSummary: 'No validation command detected.',
      detectedRisks: ['no_validation_run'],
      unresolvedIssues: ['No validation command detected.'],
      recommendedNextAction: 'Run validation.',
    } as any)

    const { server, invoke } = createMockServer()
    registerCodingTools({
      server,
      runtime,
      executeAction: vi.fn() as any,
      enableTestTools: false,
    })

    const result = await invoke('coding_review_changes', {})

    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'Change review status: needs_follow_up.',
    })
    expect(result.structuredContent).toMatchObject({
      status: 'ok',
      kind: 'coding_result',
      toolName: 'coding_review_changes',
      backendResult: {
        status: 'needs_follow_up',
      },
    })
  })

  it('registers coding_analyze_impact and returns structured impact payload', async () => {
    vi.spyOn(CodingPrimitives.prototype, 'analyzeImpact').mockResolvedValue({
      status: 'ok',
      languageSupport: 'js_ts',
      explanation: 'ok',
      targetCandidates: [],
      importExportNeighbors: ['src/a.ts'],
      directReferences: [],
      likelyImpactedTests: ['src/a.test.ts'],
      likelyCompanionFiles: ['src/a.ts'],
      graphSnapshot: { maxDepth: 1, truncated: false, nodes: [], edges: [] },
    } as any)

    const { server, invoke } = createMockServer()
    registerCodingTools({
      server,
      runtime,
      executeAction: vi.fn() as any,
      enableTestTools: false,
    })

    const result = await invoke('coding_analyze_impact', {
      targetSymbol: 'foo',
    })

    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'Impact analysis: ok.',
    })
    expect(result.structuredContent).toMatchObject({
      status: 'ok',
      kind: 'coding_result',
      toolName: 'coding_analyze_impact',
      backendResult: {
        status: 'ok',
      },
    })
  })

  it('registers coding_validate_hypothesis and returns structured hypothesis payload', async () => {
    vi.spyOn(CodingPrimitives.prototype, 'validateHypothesis').mockResolvedValue({
      status: 'validated',
      reason: 'ok',
      hypotheses: [],
      selectedHypothesis: {
        id: 'hyp_1',
        filePath: 'src/example.ts',
      },
    } as any)

    const { server, invoke } = createMockServer()
    registerCodingTools({
      server,
      runtime,
      executeAction: vi.fn() as any,
      enableTestTools: false,
    })

    const result = await invoke('coding_validate_hypothesis', {
      targetSymbol: 'foo',
      changeIntent: 'behavior_fix',
    })

    expect(result.content[0]).toMatchObject({
      type: 'text',
      text: 'Hypothesis validation: validated.',
    })
    expect(result.structuredContent).toMatchObject({
      status: 'ok',
      kind: 'coding_result',
      toolName: 'coding_validate_hypothesis',
      backendResult: {
        status: 'validated',
      },
    })
  })

  it('registers coding_diagnose_changes and coding_capture_validation_baseline', async () => {
    vi.spyOn(CodingPrimitives.prototype, 'diagnoseChanges').mockResolvedValue({
      rootCauseType: 'incomplete_change',
      confidence: 0.7,
      evidence: ['validation_failed'],
      affectedFiles: ['src/example.ts'],
      recommendedAction: 'amend',
      shouldAmendPlan: true,
      shouldAbortPlan: false,
    } as any)
    vi.spyOn(CodingPrimitives.prototype, 'captureValidationBaseline').mockResolvedValue({
      capturedAt: new Date().toISOString(),
      workspacePath: '/tmp/project/.airi-agentic-worktree',
      baselineDirtyFiles: ['src/a.ts'],
      baselineDiffSummary: '1 file changed',
      baselineFailingChecks: [],
      baselineSkippedValidations: [],
      workspaceMetadata: {
        gitAvailable: true,
      },
    } as any)

    const { server, invoke } = createMockServer()
    registerCodingTools({
      server,
      runtime,
      executeAction: vi.fn() as any,
      enableTestTools: false,
    })

    const diagnosis = await invoke('coding_diagnose_changes', {})
    expect(diagnosis.content[0]).toMatchObject({
      type: 'text',
      text: 'Change diagnosis root cause: incomplete_change.',
    })

    const baseline = await invoke('coding_capture_validation_baseline', {
      workspacePath: '/tmp/project',
    })
    expect(baseline.content[0]).toMatchObject({
      type: 'text',
      text: 'Validation baseline captured for /tmp/project/.airi-agentic-worktree.',
    })
  })
})
