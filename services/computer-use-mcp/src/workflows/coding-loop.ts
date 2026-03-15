import type { WorkflowDefinition } from './types'

export function createCodingExecutionLoopWorkflow(params?: {
  workspacePath?: string
  taskGoal?: string
  targetFile?: string
  targetSymbol?: string
  searchQuery?: string
  patchOld?: string
  patchNew?: string
  testCommand?: string
}): WorkflowDefinition {
  const workspacePath = params?.workspacePath ?? '{workspacePath}'
  const taskGoal = params?.taskGoal ?? '{taskGoal}'
  const targetFile = params?.targetFile ?? '{targetFile}'
  const targetSymbol = params?.targetSymbol
  const searchQuery = params?.searchQuery
  const patchOld = params?.patchOld ?? '{patchOld}'
  const patchNew = params?.patchNew ?? '{patchNew}'
  const testCommand = params?.testCommand ?? 'npm test'

  return {
    id: 'coding_execution_loop',
    name: `Executes a full standard coding loop on a single file`,
    description: `Reviews workspace, reads target file, plans context, applies a patch, re-reads file, runs checks, and reports deterministically.`,
    maxRetries: 2,
    steps: [
      ...(searchQuery
        ? [{
            label: 'Search codebase text',
            kind: 'coding_search_text',
            description: `Search for text ${searchQuery}`,
            params: { query: searchQuery, targetPath: workspacePath },
            critical: false,
          }] as any[]
        : []),
      ...(targetSymbol
        ? [{
            label: 'Search codebase symbol',
            kind: 'coding_search_symbol',
            description: `Search for symbol ${targetSymbol}`,
            params: { symbolName: targetSymbol, targetPath: workspacePath },
            critical: false,
          }] as any[]
        : []),
      ...(targetSymbol && targetFile !== '{targetFile}'
        ? [{
            label: 'Find symbol references',
            kind: 'coding_find_references',
            description: `Find references to ${targetSymbol}`,
            params: { filePath: targetFile },
            critical: false,
          }] as any[]
        : []),
      {
        label: 'Review Workspace',
        kind: 'coding_review_workspace',
        description: 'Review the current workspace state and git status.',
        params: { workspacePath },
        critical: true,
      },
      {
        label: 'Read target file',
        kind: 'coding_read_file',
        description: `Read the contents of ${targetFile}.`,
        params: { filePath: targetFile },
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
        description: `Patch ${targetFile}.`,
        params: { filePath: targetFile, oldString: patchOld, newString: patchNew },
        critical: true,
      },
      {
        label: 'Verify file changes',
        kind: 'coding_read_file',
        description: `Re-read ${targetFile} to ensure patch applied properly.`,
        params: { filePath: targetFile },
        critical: true,
      },
      {
        label: 'Run Validation/Tests',
        kind: 'run_command',
        description: `Run the validation command.`,
        params: { command: testCommand, cwd: workspacePath, timeoutMs: 60_000 },
        critical: false,
      },
      {
        label: 'Refresh Workspace Review',
        kind: 'coding_review_workspace',
        description: 'Refresh workspace state after applying edits and running validation.',
        params: { workspacePath },
        critical: true,
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
