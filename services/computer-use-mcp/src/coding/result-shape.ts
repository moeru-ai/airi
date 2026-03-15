import type {
  CodingContextSnapshot,
  CodingExecutionReport,
  CodingWorkspaceReview,
} from '../state'

export interface CodingReadFileBackendResult {
  [key: string]: unknown
  file: string
  length: number
  content: string
  range: 'all' | {
    startLine?: number
    endLine?: number
  }
}

export interface CodingApplyPatchBackendResult {
  [key: string]: unknown
  file: string
  diff: string
}

export type CodingToolName
  = | 'coding_review_workspace'
    | 'coding_read_file'
    | 'coding_apply_patch'
    | 'coding_compress_context'
    | 'coding_report_status'
    | 'coding_search_text'
    | 'coding_search_symbol'
    | 'coding_find_references'
    | 'coding_analyze_impact'
    | 'coding_validate_hypothesis'
    | 'coding_select_target'
    | 'coding_plan_changes'
    | 'coding_review_changes'
    | 'coding_diagnose_changes'
    | 'coding_capture_validation_baseline'

export type CodingBackendResult
  = | CodingWorkspaceReview
    | CodingReadFileBackendResult
    | CodingApplyPatchBackendResult
    | CodingContextSnapshot
    | CodingExecutionReport
    | Record<string, unknown>

export function buildCodingReadFileBackendResult(params: {
  filePath: string
  content: string
  startLine?: number
  endLine?: number
}): CodingReadFileBackendResult {
  const { filePath, content, startLine, endLine } = params

  return {
    file: filePath,
    length: content.length,
    content,
    range: startLine === undefined && endLine === undefined
      ? 'all'
      : {
          startLine,
          endLine,
        },
  }
}

export function buildCodingApplyPatchBackendResult(params: {
  filePath: string
  summary: string
}): CodingApplyPatchBackendResult {
  return {
    file: params.filePath,
    diff: params.summary,
  }
}

export function buildCodingToolStructuredContent(params: {
  toolName: CodingToolName
  backendResult: CodingBackendResult
}) {
  return {
    status: 'ok' as const,
    kind: 'coding_result' as const,
    toolName: params.toolName,
    backendResult: params.backendResult,
  }
}

export function summarizeCodingToolResult(params: {
  toolName: CodingToolName
  backendResult: CodingBackendResult
}) {
  const { toolName, backendResult } = params

  switch (toolName) {
    case 'coding_review_workspace':
      return `Reviewed workspace ${String((backendResult as CodingWorkspaceReview).workspacePath)}.`
    case 'coding_read_file':
      return `Read ${String((backendResult as CodingReadFileBackendResult).file)}.`
    case 'coding_apply_patch':
      return `Patched ${String((backendResult as CodingApplyPatchBackendResult).file)}.`
    case 'coding_compress_context':
      return 'Compressed coding context.'
    case 'coding_report_status':
      return `Reported coding status: ${String((backendResult as CodingExecutionReport).status)}.`
    case 'coding_search_text':
      return `Searched text with ${String((backendResult as Record<string, unknown>).total || 0)} match(es).`
    case 'coding_search_symbol':
      return `Searched symbol with ${String((backendResult as Record<string, unknown>).total || 0)} match(es).`
    case 'coding_find_references':
      return `Found references: ${String((backendResult as Record<string, unknown>).total || 0)}.`
    case 'coding_analyze_impact':
      return `Impact analysis: ${String((backendResult as Record<string, unknown>).status || 'unknown')}.`
    case 'coding_validate_hypothesis':
      return `Hypothesis validation: ${String((backendResult as Record<string, unknown>).status || 'unknown')}.`
    case 'coding_select_target':
      return `Target selection: ${String((backendResult as Record<string, unknown>).status || 'unknown')}.`
    case 'coding_plan_changes':
      return `Planned ${String(((backendResult as Record<string, unknown>).steps as unknown[] | undefined)?.length || 0)} file change step(s).`
    case 'coding_review_changes':
      return `Change review status: ${String((backendResult as Record<string, unknown>).status || 'unknown')}.`
    case 'coding_diagnose_changes':
      return `Change diagnosis root cause: ${String((backendResult as Record<string, unknown>).rootCauseType || 'unknown')}.`
    case 'coding_capture_validation_baseline':
      return `Validation baseline captured for ${String((backendResult as Record<string, unknown>).workspacePath || 'workspace')}.`
  }
}
