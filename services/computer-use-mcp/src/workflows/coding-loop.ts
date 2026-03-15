import type { WorkflowDefinition } from './types'

export function createCodingExecutionLoopWorkflow(params?: {
  workspacePath?: string
  taskGoal?: string
  targetFile?: string
  targetSymbol?: string
  searchQuery?: string
  targetLine?: number
  targetColumn?: number
  allowMultiFile?: boolean
  maxPlannedFiles?: number
  patchOld?: string
  patchNew?: string
  testCommand?: string
}): WorkflowDefinition {
  const workspacePath = params?.workspacePath ?? '{workspacePath}'
  const taskGoal = params?.taskGoal ?? '{taskGoal}'
  const targetFile = params?.targetFile ?? 'auto'
  const targetSymbol = params?.targetSymbol
  const searchQuery = params?.searchQuery
  const targetLine = params?.targetLine
  const targetColumn = params?.targetColumn
  const allowMultiFile = params?.allowMultiFile ?? true
  const maxPlannedFiles = Math.min(Math.max(params?.maxPlannedFiles ?? 2, 1), 3)
  const patchOld = params?.patchOld ?? '{patchOld}'
  const patchNew = params?.patchNew ?? '{patchNew}'
  const testCommand = params?.testCommand ?? 'auto'

  return {
    id: 'coding_execution_loop',
    name: `Executes a full standard coding loop with optional search-driven target resolution`,
    description: `Reviews workspace, optionally searches symbols/text, resolves target file (explicit or auto), applies a patch, validates, and reports deterministically.`,
    maxRetries: 2,
    steps: [
      {
        label: 'Review Workspace',
        kind: 'coding_review_workspace',
        description: 'Review the current workspace state and git status.',
        params: { workspacePath },
        critical: true,
      },
      ...(searchQuery
        ? [{
            label: 'Search codebase text',
            kind: 'coding_search_text' as const,
            description: `Search for text ${searchQuery}`,
            params: { query: searchQuery },
            critical: false,
          }]
        : []),
      ...(targetSymbol
        ? [{
            label: 'Search codebase symbol',
            kind: 'coding_search_symbol' as const,
            description: `Search for symbol ${targetSymbol}`,
            params: { symbolName: targetSymbol },
            critical: false,
          }]
        : []),
      ...(params?.targetFile && targetSymbol && targetLine !== undefined && targetColumn !== undefined
        ? [{
            label: 'Find symbol references',
            kind: 'coding_find_references' as const,
            description: `Find references for ${targetSymbol} from ${targetFile}:${targetLine}:${targetColumn}`,
            params: { filePath: targetFile, targetLine, targetColumn },
            critical: false,
          }]
        : []),
      {
        label: 'Select deterministic target',
        kind: 'coding_select_target',
        description: 'Select a deterministic target file from explicit/search candidates.',
        params: {
          targetFile: params?.targetFile,
          searchQuery,
          targetSymbol,
        },
        critical: true,
      },
      {
        label: 'Plan limited changes',
        kind: 'coding_plan_changes',
        description: 'Build a deterministic limited plan (max 3 files) with dependsOn/checkpoint and capture diff baseline.',
        params: {
          intent: taskGoal,
          allowMultiFile,
          maxPlannedFiles,
        },
        critical: true,
      },
      {
        label: 'Read target file',
        kind: 'coding_read_file',
        description: 'Read the selected target file.',
        params: { filePath: 'auto' },
        critical: true,
      },
      {
        label: 'Compress Context',
        kind: 'coding_compress_context',
        description: 'Summarize current goal and file state before applying changes.',
        params: {
          goal: taskGoal,
          filesSummary: 'auto',
          recentResultSummary: 'auto',
          unresolvedIssues: 'auto',
          nextStepRecommendation: 'auto',
        },
        critical: true,
      },
      {
        label: 'Apply Patch',
        kind: 'coding_apply_patch',
        description: 'Patch the selected target file.',
        params: { filePath: 'auto', oldString: patchOld, newString: patchNew },
        critical: true,
      },
      {
        label: 'Verify file changes',
        kind: 'coding_read_file',
        description: 'Re-read selected file to ensure patch applied properly.',
        params: { filePath: 'auto' },
        critical: true,
      },
      {
        label: 'Run Validation/Tests',
        kind: 'run_command',
        description: 'Run scoped validation command (auto resolves to file-level checks when possible).',
        params: { command: testCommand, cwd: workspacePath, timeoutMs: 60_000 },
        critical: false,
      },
      {
        label: 'Review deterministic changes',
        kind: 'coding_review_changes',
        description: 'Run deterministic diff-aware review against planned/baseline files.',
        params: {},
        critical: false,
      },
      {
        label: 'Self-review and Report',
        kind: 'coding_report_status',
        description: 'Report the structured execution status for the loop.',
        params: {
          status: 'auto',
          summary: 'auto',
          filesTouched: ['auto'],
          commandsRun: ['auto'],
          checks: ['auto'],
          nextStep: 'auto',
        },
        critical: true,
      },
    ],
  }
}
