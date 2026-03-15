import type { CodingChangeIntent } from '../state'
import type { WorkflowDefinition } from './types'

export function createCodingAgenticLoopWorkflow(params?: {
  workspacePath?: string
  taskGoal?: string
  targetFile?: string
  targetSymbol?: string
  searchQuery?: string
  targetLine?: number
  targetColumn?: number
  allowMultiFile?: boolean
  maxPlannedFiles?: number
  changeIntent?: CodingChangeIntent
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
  const changeIntent = params?.changeIntent ?? 'behavior_fix'
  const patchOld = params?.patchOld ?? '{patchOld}'
  const patchNew = params?.patchNew ?? '{patchNew}'
  const testCommand = params?.testCommand ?? 'auto'

  return {
    id: 'coding_agentic_loop',
    name: 'Executes an agentic coding loop with bounded DAG planning and judge-assisted causal diagnosis',
    description: 'Runs workspace review, captures baseline/worktree, impact analysis, hypothesis-driven target selection, bounded DAG-style session planning, patching, validation, deterministic review, judge-assisted diagnosis with schema fallback, and status report.',
    maxRetries: 2,
    steps: [
      {
        label: 'Review Workspace',
        kind: 'coding_review_workspace',
        description: 'Review workspace state and git summary before agentic execution.',
        params: { workspacePath },
        critical: true,
      },
      {
        label: 'Capture Validation Baseline',
        kind: 'coding_capture_validation_baseline',
        description: 'Capture baseline dirty tree/failing checks and switch to temporary worktree when possible.',
        params: {
          workspacePath,
          createTemporaryWorktree: true,
        },
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
        label: 'Analyze Local Impact Graph',
        kind: 'coding_analyze_impact',
        description: 'Construct bounded local impact graph from symbol/search candidates.',
        params: {
          targetFile: params?.targetFile,
          searchQuery,
          targetSymbol,
          maxDepth: 1,
        },
        critical: true,
      },
      {
        label: 'Validate Target Hypothesis',
        kind: 'coding_validate_hypothesis',
        description: 'Validate target hypothesis against impact analysis evidence.',
        params: {
          targetFile: params?.targetFile,
          searchQuery,
          targetSymbol,
          changeIntent,
        },
        critical: true,
      },
      {
        label: 'Select intent-driven target',
        kind: 'coding_select_target',
        description: 'Select target file using deterministic tie-break and hypothesis evidence.',
        params: {
          targetFile: params?.targetFile,
          searchQuery,
          targetSymbol,
          changeIntent,
        },
        critical: true,
      },
      {
        label: 'Create session-aware plan',
        kind: 'coding_plan_changes',
        description: 'Create bounded plan session (max 3 files) with dependsOn/checkpoint and investigation/amend/abort transitions.',
        params: {
          intent: taskGoal,
          allowMultiFile,
          maxPlannedFiles,
          changeIntent,
          sessionAware: true,
        },
        critical: true,
      },
      {
        label: 'Select next executable session step',
        kind: 'coding_select_target',
        description: 'Re-evaluate session DAG state and pick the next executable step for this round.',
        params: {
          changeIntent,
        },
        critical: true,
      },
      {
        label: 'Read target file',
        kind: 'coding_read_file',
        description: 'Read selected target file from current coding workspace.',
        params: { filePath: 'auto' },
        critical: true,
      },
      {
        label: 'Compress Context',
        kind: 'coding_compress_context',
        description: 'Summarize context before mutation.',
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
        description: 'Patch selected target file.',
        params: { filePath: 'auto', oldString: patchOld, newString: patchNew },
        critical: true,
      },
      {
        label: 'Verify file changes',
        kind: 'coding_read_file',
        description: 'Re-read selected file to verify patch application.',
        params: { filePath: 'auto' },
        critical: true,
      },
      {
        label: 'Run scoped validation',
        kind: 'run_command',
        description: 'Run scoped validation command in isolated workspace (auto resolves to minimal file-level checks when possible).',
        params: { command: testCommand, cwd: 'auto', timeoutMs: 60_000 },
        critical: false,
      },
      {
        label: 'Review deterministic changes',
        kind: 'coding_review_changes',
        description: 'Run deterministic guard-rail review against current plan/session.',
        params: {},
        critical: false,
      },
      {
        label: 'Diagnose change failure',
        kind: 'coding_diagnose_changes',
        description: 'Generate structured root cause for amend/abort decisions.',
        params: {},
        critical: false,
      },
      {
        label: 'Report final status',
        kind: 'coding_report_status',
        description: 'Report structured status with deterministic fields.',
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
