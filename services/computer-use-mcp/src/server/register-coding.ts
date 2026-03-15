import type { RegisterComputerUseToolsOptions } from './register-tools'

import { z } from 'zod'

import { CodingPrimitives } from '../coding/primitives'
import {
  buildCodingApplyPatchBackendResult,
  buildCodingReadFileBackendResult,
  buildCodingToolStructuredContent,
  summarizeCodingToolResult,
} from '../coding/result-shape'
import { textContent } from './content'

export function registerCodingTools(options: RegisterComputerUseToolsOptions) {
  const { server, runtime } = options
  const primitives = new CodingPrimitives(runtime)

  server.tool(
    'coding_review_workspace',
    'Review the current workspace state, get git status, and set context.',
    {
      workspacePath: z.string().describe('Absolute path to the workspace root. Future commands will use this as root.'),
    },
    async ({ workspacePath }) => {
      const result = await primitives.reviewWorkspace(workspacePath)
      return {
        content: [textContent(summarizeCodingToolResult({
          toolName: 'coding_review_workspace',
          backendResult: result,
        }))],
        structuredContent: buildCodingToolStructuredContent({
          toolName: 'coding_review_workspace',
          backendResult: result,
        }),
      }
    },
  )

  server.tool(
    'coding_read_file',
    'Read a file or range of lines from a file within the workspace.',
    {
      filePath: z.string().describe('Workspace-relative file path, or "auto" to use last deterministic target selection.'),
      startLine: z.number().int().min(1).optional().describe('1-based start line.'),
      endLine: z.number().int().min(1).optional().describe('1-based end line.'),
    },
    async ({ filePath, startLine, endLine }) => {
      const output = await primitives.readFile(filePath, startLine, endLine)
      const backendResult = buildCodingReadFileBackendResult({
        filePath,
        content: output,
        startLine,
        endLine,
      })

      return {
        content: [textContent(summarizeCodingToolResult({
          toolName: 'coding_read_file',
          backendResult,
        }))],
        structuredContent: buildCodingToolStructuredContent({
          toolName: 'coding_read_file',
          backendResult,
        }),
      }
    },
  )

  server.tool(
    'coding_search_text',
    'Search text in workspace files with deterministic payload limits.',
    {
      query: z.string().min(1).describe('Text query to search for.'),
      targetPath: z.string().optional().describe('Optional workspace-relative subdirectory to scope the search.'),
      glob: z.string().optional().describe('Optional ripgrep-style glob filter, e.g. "*.ts".'),
      limit: z.number().int().min(1).max(20).optional().describe('Maximum number of matches to return (hard-clamped to 20).'),
    },
    async ({ query, targetPath, glob, limit }) => {
      const result = await primitives.searchText(query, targetPath, glob, limit)

      return {
        content: [textContent(summarizeCodingToolResult({
          toolName: 'coding_search_text',
          backendResult: result,
        }))],
        structuredContent: buildCodingToolStructuredContent({
          toolName: 'coding_search_text',
          backendResult: result,
        }),
      }
    },
  )

  server.tool(
    'coding_search_symbol',
    'Search symbol declarations in TS/JS source files with optional glob and result limit.',
    {
      symbolName: z.string().min(1).describe('Exact symbol name to search for.'),
      targetPath: z.string().optional().describe('Optional workspace-relative subdirectory to scope the search.'),
      glob: z.string().optional().describe('Optional ripgrep-style glob filter, e.g. "*.ts".'),
      limit: z.number().int().min(1).max(20).optional().describe('Maximum number of matches to return (hard-clamped to 20).'),
    },
    async ({ symbolName, targetPath, glob, limit }) => {
      const result = await primitives.searchSymbol(symbolName, targetPath, glob, limit)
      const backendResult = result as unknown as Record<string, unknown>

      return {
        content: [textContent(summarizeCodingToolResult({
          toolName: 'coding_search_symbol',
          backendResult,
        }))],
        structuredContent: buildCodingToolStructuredContent({
          toolName: 'coding_search_symbol',
          backendResult,
        }),
      }
    },
  )

  server.tool(
    'coding_find_references',
    'Find symbol references from a specific file position using TypeScript language service.',
    {
      filePath: z.string().describe('Workspace-relative file path where the symbol occurrence exists, or "auto" to use last deterministic target selection.'),
      targetLine: z.number().int().min(1).describe('1-based line number of the symbol occurrence.'),
      targetColumn: z.number().int().min(1).describe('1-based column number of the symbol occurrence.'),
      limit: z.number().int().min(1).max(20).optional().describe('Maximum number of references to return (hard-clamped to 20).'),
    },
    async ({ filePath, targetLine, targetColumn, limit }) => {
      const result = await primitives.findReferences(filePath, targetLine, targetColumn, limit)
      const backendResult = result as unknown as Record<string, unknown>

      return {
        content: [textContent(summarizeCodingToolResult({
          toolName: 'coding_find_references',
          backendResult,
        }))],
        structuredContent: buildCodingToolStructuredContent({
          toolName: 'coding_find_references',
          backendResult,
        }),
      }
    },
  )

  server.tool(
    'coding_select_target',
    'Select a deterministic target file from explicit and search-derived candidates.',
    {
      targetFile: z.string().optional().describe('Optional explicit workspace-relative file path (highest selection priority).'),
      targetPath: z.string().optional().describe('Optional workspace-relative scoped path used for deterministic tie-break scoring.'),
      targetSymbol: z.string().optional().describe('Optional symbol hint for selection reasoning metadata.'),
      searchQuery: z.string().optional().describe('Optional text-search hint for selection reasoning metadata.'),
      changeIntent: z.enum(['behavior_fix', 'refactor', 'api_change', 'config_change', 'test_fix']).optional().describe('Optional intent hint for hypothesis-driven selection.'),
    },
    async ({ targetFile, targetPath, targetSymbol, searchQuery, changeIntent }) => {
      const result = await primitives.selectTarget({
        targetFile,
        targetPath,
        targetSymbol,
        searchQuery,
        changeIntent,
      })
      const backendResult = result as unknown as Record<string, unknown>

      return {
        content: [textContent(summarizeCodingToolResult({
          toolName: 'coding_select_target',
          backendResult,
        }))],
        structuredContent: buildCodingToolStructuredContent({
          toolName: 'coding_select_target',
          backendResult,
        }),
      }
    },
  )

  server.tool(
    'coding_plan_changes',
    'Create a deterministic limited coding plan (max 3 files, unique files only, dependsOn/checkpoint enabled).',
    {
      intent: z.string().min(1).describe('Short intent for the planned changes.'),
      allowMultiFile: z.boolean().optional().describe('Whether multi-file planning is allowed (default: true).'),
      maxPlannedFiles: z.number().int().min(1).max(3).optional().describe('Maximum number of planned files (default: 2, max: 3).'),
      changeIntent: z.enum(['behavior_fix', 'refactor', 'api_change', 'config_change', 'test_fix']).optional().describe('Intent category for session-aware planning.'),
      sessionAware: z.boolean().optional().describe('Enable bounded plan-session state machine behavior.'),
    },
    async ({ intent, allowMultiFile, maxPlannedFiles, changeIntent, sessionAware }) => {
      const result = await primitives.planChanges({
        intent,
        allowMultiFile,
        maxPlannedFiles,
        changeIntent,
        sessionAware,
      })
      const backendResult = result as unknown as Record<string, unknown>

      return {
        content: [textContent(summarizeCodingToolResult({
          toolName: 'coding_plan_changes',
          backendResult,
        }))],
        structuredContent: buildCodingToolStructuredContent({
          toolName: 'coding_plan_changes',
          backendResult,
        }),
      }
    },
  )

  server.tool(
    'coding_analyze_impact',
    'Analyze local 1-hop impact graph for JS/TS targets and produce bounded impact evidence.',
    {
      targetFile: z.string().optional().describe('Optional explicit workspace-relative target file.'),
      targetPath: z.string().optional().describe('Optional workspace-relative scoped path for analysis.'),
      targetSymbol: z.string().optional().describe('Optional symbol name to anchor semantic impact analysis.'),
      searchQuery: z.string().optional().describe('Optional text query used as candidate evidence.'),
      maxDepth: z.number().int().min(1).max(1).optional().describe('Impact depth (v1 fixed to 1-hop).'),
    },
    async ({ targetFile, targetPath, targetSymbol, searchQuery, maxDepth }) => {
      const result = await primitives.analyzeImpact({
        targetFile,
        targetPath,
        targetSymbol,
        searchQuery,
        maxDepth,
      })
      const backendResult = result as unknown as Record<string, unknown>

      return {
        content: [textContent(summarizeCodingToolResult({
          toolName: 'coding_analyze_impact',
          backendResult,
        }))],
        structuredContent: buildCodingToolStructuredContent({
          toolName: 'coding_analyze_impact',
          backendResult,
        }),
      }
    },
  )

  server.tool(
    'coding_validate_hypothesis',
    'Validate intent-driven target hypotheses against local impact evidence.',
    {
      targetFile: z.string().optional().describe('Optional explicit workspace-relative target file.'),
      targetPath: z.string().optional().describe('Optional workspace-relative scoped path for analysis.'),
      targetSymbol: z.string().optional().describe('Optional symbol name for hypothesis validation.'),
      searchQuery: z.string().optional().describe('Optional text query used as candidate evidence.'),
      changeIntent: z.enum(['behavior_fix', 'refactor', 'api_change', 'config_change', 'test_fix']).describe('Change intent for hypothesis scoring.'),
    },
    async ({ targetFile, targetPath, targetSymbol, searchQuery, changeIntent }) => {
      const result = await primitives.validateHypothesis({
        targetFile,
        targetPath,
        targetSymbol,
        searchQuery,
        changeIntent,
      })

      return {
        content: [textContent(summarizeCodingToolResult({
          toolName: 'coding_validate_hypothesis',
          backendResult: result,
        }))],
        structuredContent: buildCodingToolStructuredContent({
          toolName: 'coding_validate_hypothesis',
          backendResult: result,
        }),
      }
    },
  )

  server.tool(
    'coding_diagnose_changes',
    'Diagnose change failures into structured root causes for amend/abort decisions.',
    {
      currentFilePath: z.string().optional().describe('Optional current file path under diagnosis.'),
      validationOutput: z.string().optional().describe('Optional validation output override for diagnosis.'),
    },
    async ({ currentFilePath, validationOutput }) => {
      const result = await primitives.diagnoseChanges({
        currentFilePath,
        validationOutput,
      })
      const backendResult = result as unknown as Record<string, unknown>

      return {
        content: [textContent(summarizeCodingToolResult({
          toolName: 'coding_diagnose_changes',
          backendResult,
        }))],
        structuredContent: buildCodingToolStructuredContent({
          toolName: 'coding_diagnose_changes',
          backendResult,
        }),
      }
    },
  )

  server.tool(
    'coding_capture_validation_baseline',
    'Capture baseline diff/failing checks and optionally switch to a temporary git worktree for isolated edits.',
    {
      workspacePath: z.string().optional().describe('Optional absolute workspace path override.'),
      createTemporaryWorktree: z.boolean().optional().describe('Whether to create and switch to a temporary git worktree (default: true).'),
    },
    async ({ workspacePath, createTemporaryWorktree }) => {
      const result = await primitives.captureValidationBaseline({
        workspacePath,
        createTemporaryWorktree,
      })
      const backendResult = result as unknown as Record<string, unknown>

      return {
        content: [textContent(summarizeCodingToolResult({
          toolName: 'coding_capture_validation_baseline',
          backendResult,
        }))],
        structuredContent: buildCodingToolStructuredContent({
          toolName: 'coding_capture_validation_baseline',
          backendResult,
        }),
      }
    },
  )

  server.tool(
    'coding_review_changes',
    'Run deterministic diff-aware review for the current coding plan/file.',
    {
      currentFilePath: z.string().optional().describe('Optional explicit file path to review; defaults to currently selected target/plan step.'),
    },
    async ({ currentFilePath }) => {
      const result = await primitives.reviewChanges({ currentFilePath })
      const backendResult = result as unknown as Record<string, unknown>

      return {
        content: [textContent(summarizeCodingToolResult({
          toolName: 'coding_review_changes',
          backendResult,
        }))],
        structuredContent: buildCodingToolStructuredContent({
          toolName: 'coding_review_changes',
          backendResult,
        }),
      }
    },
  )

  server.tool(
    'coding_apply_patch',
    'Apply a patch/replacement to a file within the workspace.',
    {
      filePath: z.string().describe('Workspace-relative file path, or "auto" to use last deterministic target selection.'),
      oldString: z.string().describe('Exact string to replace.'),
      newString: z.string().describe('String to replace it with.'),
    },
    async ({ filePath, oldString, newString }) => {
      const output = await primitives.applyPatch(filePath, oldString, newString)
      const backendResult = buildCodingApplyPatchBackendResult({
        filePath,
        summary: output,
      })

      return {
        content: [textContent(summarizeCodingToolResult({
          toolName: 'coding_apply_patch',
          backendResult,
        }))],
        structuredContent: buildCodingToolStructuredContent({
          toolName: 'coding_apply_patch',
          backendResult,
        }),
      }
    },
  )

  server.tool(
    'coding_compress_context',
    'Summarize coding context and extract constraints and state into a deterministic output.',
    {
      goal: z.string().describe('Current high-level goal.'),
      filesSummary: z.string().describe('Summary of relevant files.'),
      recentResultSummary: z.string().describe('Summary of the last few command executions.'),
      unresolvedIssues: z.string().describe('Any known open issues or blockers.'),
      nextStepRecommendation: z.string().describe('Immediate next logical step.'),
    },
    async ({ goal, filesSummary, recentResultSummary, unresolvedIssues, nextStepRecommendation }) => {
      const result = await primitives.compressContext(goal, filesSummary, recentResultSummary, unresolvedIssues, nextStepRecommendation)
      return {
        content: [textContent(summarizeCodingToolResult({
          toolName: 'coding_compress_context',
          backendResult: result,
        }))],
        structuredContent: buildCodingToolStructuredContent({
          toolName: 'coding_compress_context',
          backendResult: result,
        }),
      }
    },
  )

  server.tool(
    'coding_report_status',
    'Report structured execution status for the current iteration.',
    {
      status: z.enum(['completed', 'in_progress', 'blocked', 'failed', 'auto']).describe('Current execution phase status, or "auto" to derive it from recent coding state.'),
      summary: z.string().describe('Brief status summary.'),
      filesTouched: z.array(z.string()).describe('List of files modified.'),
      commandsRun: z.array(z.string()).describe('List of terminal commands executed.'),
      checks: z.array(z.string()).describe('Results of specific validation checks.'),
      nextStep: z.string().describe('Next suggested step or reason for blocking.'),
    },
    async ({ status, summary, filesTouched, commandsRun, checks, nextStep }) => {
      const result = await primitives.reportStatus(status, summary, filesTouched, commandsRun, checks, nextStep)
      return {
        content: [textContent(summarizeCodingToolResult({
          toolName: 'coding_report_status',
          backendResult: result,
        }))],
        structuredContent: buildCodingToolStructuredContent({
          toolName: 'coding_report_status',
          backendResult: result,
        }),
      }
    },
  )
}
