import type { ChatToolCallRendererProps } from '../tool-call-renderer'

import { describe, expect, it } from 'vitest'

import {
  codingWorkspaceToolRendererRegistry,
  createDiagnosticsRendererModel,
  createSemanticSearchRendererModel,
  createSubagentJobStatusRendererModel,
  DiagnosticsRenderer,
  SemanticSearchRenderer,
  SerenaNoticeRenderer,
  SpecPhaseStatusRenderer,
  SubagentJobStatusRenderer,
} from './index'

describe('coding workspace chat renderers', () => {
  it('keeps executing semantic search results compact', () => {
    const props = {
      toolName: 'workspace_find_symbol',
      args: JSON.stringify({ query: 'AiriRuntime', relativePath: 'src/runtime.ts' }),
      state: 'executing',
    } satisfies ChatToolCallRendererProps

    const model = createSemanticSearchRendererModel(props)

    expect(model.state).toBe('executing')
    expect(model.title).toBe('Symbol')
    expect(model.summary).toBe('AiriRuntime')
    expect(model.rows).toEqual([])
  })

  it('summarizes done diagnostics by severity', () => {
    const props = {
      toolName: 'workspace_get_diagnostics',
      args: JSON.stringify({ relativePath: 'src/app.ts' }),
      state: 'done',
      result: {
        backend: 'serena',
        rawResult: {
          structuredContent: {
            diagnostics: [
              { severity: 'error', message: 'Missing import', filePath: 'src/app.ts', line: 3 },
              { severity: 'warning', message: 'Unused variable', filePath: 'src/app.ts', line: 9 },
            ],
          },
        },
      },
    } satisfies ChatToolCallRendererProps

    const model = createDiagnosticsRendererModel(props)

    expect(model.state).toBe('done')
    expect(model.summary).toBe('1 error, 1 warning')
    expect(model.backend).toBe('serena')
    expect(model.rows.map((row) => row.title)).toEqual(['Missing import', 'Unused variable'])
  })

  it('shows error state without losing subagent context', () => {
    const props = {
      toolName: 'workspace_update_subagent_job',
      args: JSON.stringify({ jobId: 'job-1' }),
      state: 'error',
      result: {
        job: {
          phase: 'implementation',
          taskDescription: 'Implement T-007',
          engine: 'native',
          status: 'failed',
          inputs: [],
          outputs: [],
          provenance: [],
        },
        error: 'Job failed',
      },
    } satisfies ChatToolCallRendererProps

    const model = createSubagentJobStatusRendererModel(props)

    expect(model.state).toBe('error')
    expect(model.title).toBe('Subagent')
    expect(model.summary).toBe('failed')
    expect(model.rows[0]?.title).toBe('Implement T-007')
  })

  it('registers expected coding workspace tool keys', () => {
    expect(codingWorkspaceToolRendererRegistry).toMatchObject({
      workspace_status: SerenaNoticeRenderer,
      workspace_get_symbols_overview: SemanticSearchRenderer,
      workspace_find_symbol: SemanticSearchRenderer,
      workspace_find_declaration: SemanticSearchRenderer,
      workspace_find_references: SemanticSearchRenderer,
      workspace_get_diagnostics: DiagnosticsRenderer,
      workspace_search_pattern: SemanticSearchRenderer,
      workspace_ranked_context: SemanticSearchRenderer,
      workspace_update_spec_artifact: SpecPhaseStatusRenderer,
      workspace_create_subagent_job: SubagentJobStatusRenderer,
      workspace_update_subagent_job: SubagentJobStatusRenderer,
    })
  })
})
