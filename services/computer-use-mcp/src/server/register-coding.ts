import type { RegisterComputerUseToolsOptions } from './register-tools'

import { z } from 'zod'

import { CodingPrimitives } from '../coding/primitives'
import {
  buildCodingReadFileBackendResult,
  buildCodingToolStructuredContent,
  summarizeCodingToolResult,
} from '../coding/result-shape'
import { textContent } from './content'
import { registerToolWithDescriptor, requireDescriptor } from './tool-descriptors'
import { captureVerificationEvidence } from './verification-evidence-capture'

export function registerCodingTools(options: RegisterComputerUseToolsOptions) {
  const { server, runtime, executeAction } = options
  const primitives = new CodingPrimitives(runtime)

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('coding_review_workspace'),
    schema: {
      workspacePath: z.string().describe('Absolute path to the workspace root. Future commands will use this as root.'),
    },
    handler: async ({ workspacePath }) => {
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
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('coding_read_file'),
    schema: {
      filePath: z.string().describe('Workspace-relative file path, or "auto" to use last deterministic target selection.'),
      startLine: z.number().int().min(1).optional().describe('1-based start line.'),
      endLine: z.number().int().min(1).optional().describe('1-based end line.'),
    },
    handler: async ({ filePath, startLine, endLine }) => {
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
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('coding_search_text'),
    schema: {
      query: z.string().min(1).describe('Text query to search for.'),
      targetPath: z.string().optional().describe('Optional workspace-relative subdirectory to scope the search.'),
      glob: z.string().optional().describe('Optional ripgrep-style glob filter, e.g. "*.ts".'),
      limit: z.number().int().min(1).max(20).optional().describe('Maximum number of matches to return (hard-clamped to 20).'),
    },
    handler: async ({ query, targetPath, glob, limit }) => {
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
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('coding_search_symbol'),
    schema: {
      symbolName: z.string().min(1).describe('Exact symbol name to search for.'),
      targetPath: z.string().optional().describe('Optional workspace-relative subdirectory to scope the search.'),
      glob: z.string().optional().describe('Optional ripgrep-style glob filter, e.g. "*.ts".'),
      limit: z.number().int().min(1).max(20).optional().describe('Maximum number of matches to return (hard-clamped to 20).'),
    },
    handler: async ({ symbolName, targetPath, glob, limit }) => {
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
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('coding_find_references'),
    schema: {
      filePath: z.string().describe('Workspace-relative file path where the symbol occurrence exists, or "auto" to use last deterministic target selection.'),
      targetLine: z.number().int().min(1).describe('1-based line number of the symbol occurrence.'),
      targetColumn: z.number().int().min(1).describe('1-based column number of the symbol occurrence.'),
      limit: z.number().int().min(1).max(20).optional().describe('Maximum number of references to return (hard-clamped to 20).'),
    },
    handler: async ({ filePath, targetLine, targetColumn, limit }) => {
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
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('coding_select_target'),
    schema: {
      targetFile: z.string().optional().describe('Optional explicit workspace-relative file path (highest selection priority).'),
      targetPath: z.string().optional().describe('Optional workspace-relative scoped path used for deterministic tie-break scoring.'),
      targetSymbol: z.string().optional().describe('Optional symbol hint for selection reasoning metadata.'),
      searchQuery: z.string().optional().describe('Optional text-search hint for selection reasoning metadata.'),
      changeIntent: z.enum(['behavior_fix', 'refactor', 'api_change', 'config_change', 'test_fix']).optional().describe('Optional intent hint for hypothesis-driven selection.'),
    },
    handler: async ({ targetFile, targetPath, targetSymbol, searchQuery, changeIntent }) => {
      const { result, retrieval } = await primitives.selectTargetWithRetrieval({
        targetFile,
        targetPath,
        targetSymbol,
        searchQuery,
        changeIntent,
      })
      const backendResult = {
        ...result,
        ...(retrieval ? { retrieval } : {}),
      } as unknown as Record<string, unknown>

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
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('coding_plan_changes'),
    schema: {
      intent: z.string().min(1).describe('Short intent for the planned changes.'),
      allowMultiFile: z.boolean().optional().describe('Whether multi-file planning is allowed (default: true).'),
      maxPlannedFiles: z.number().int().min(1).max(3).optional().describe('Maximum number of planned files (default: 2, max: 3).'),
      changeIntent: z.enum(['behavior_fix', 'refactor', 'api_change', 'config_change', 'test_fix']).optional().describe('Intent category for session-aware planning.'),
      sessionAware: z.boolean().optional().describe('Enable bounded plan-session state machine behavior.'),
    },
    handler: async ({ intent, allowMultiFile, maxPlannedFiles, changeIntent, sessionAware }) => {
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
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('coding_analyze_impact'),
    schema: {
      targetFile: z.string().optional().describe('Optional explicit workspace-relative target file.'),
      targetPath: z.string().optional().describe('Optional workspace-relative scoped path for analysis.'),
      targetSymbol: z.string().optional().describe('Optional symbol name to anchor semantic impact analysis.'),
      searchQuery: z.string().optional().describe('Optional text query used as candidate evidence.'),
      maxDepth: z.number().int().min(1).max(1).optional().describe('Impact depth (v1 fixed to 1-hop).'),
    },
    handler: async ({ targetFile, targetPath, targetSymbol, searchQuery, maxDepth }) => {
      const { result, retrieval } = await primitives.analyzeImpactWithRetrieval({
        targetFile,
        targetPath,
        targetSymbol,
        searchQuery,
        maxDepth,
      })
      const backendResult = {
        ...result,
        ...(retrieval ? { retrieval } : {}),
      } as unknown as Record<string, unknown>

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
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('coding_validate_hypothesis'),
    schema: {
      targetFile: z.string().optional().describe('Optional explicit workspace-relative target file.'),
      targetPath: z.string().optional().describe('Optional workspace-relative scoped path for analysis.'),
      targetSymbol: z.string().optional().describe('Optional symbol name for hypothesis validation.'),
      searchQuery: z.string().optional().describe('Optional text query used as candidate evidence.'),
      changeIntent: z.enum(['behavior_fix', 'refactor', 'api_change', 'config_change', 'test_fix']).describe('Change intent for hypothesis scoring.'),
    },
    handler: async ({ targetFile, targetPath, targetSymbol, searchQuery, changeIntent }) => {
      const { result, retrieval } = await primitives.validateHypothesisWithRetrieval({
        targetFile,
        targetPath,
        targetSymbol,
        searchQuery,
        changeIntent,
      })
      const backendResult = {
        ...result,
        ...(retrieval ? { retrieval } : {}),
      }

      return {
        content: [textContent(summarizeCodingToolResult({
          toolName: 'coding_validate_hypothesis',
          backendResult,
        }))],
        structuredContent: buildCodingToolStructuredContent({
          toolName: 'coding_validate_hypothesis',
          backendResult,
        }),
      }
    },
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('coding_diagnose_changes'),
    schema: {
      currentFilePath: z.string().optional().describe('Optional current file path under diagnosis.'),
      validationOutput: z.string().optional().describe('Optional validation output override for diagnosis.'),
    },
    handler: async ({ currentFilePath, validationOutput }) => {
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
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('coding_capture_validation_baseline'),
    schema: {
      workspacePath: z.string().optional().describe('Optional absolute workspace path override.'),
      createTemporaryWorktree: z.boolean().optional().describe('Whether to create and switch to a temporary git worktree (default: true).'),
    },
    handler: async ({ workspacePath, createTemporaryWorktree }) => {
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
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('coding_review_changes'),
    schema: {
      currentFilePath: z.string().optional().describe('Optional explicit file path to review; defaults to currently selected target/plan step.'),
    },
    handler: async ({ currentFilePath }) => {
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
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('coding_apply_patch'),
    schema: {
      filePath: z.string().describe('Workspace-relative file path, or "auto" to use last deterministic target selection.'),
      oldString: z.string().describe('Exact string to replace. Must match the file exactly, including whitespace and indentation.'),
      newString: z.string().describe('String to replace it with.'),
    },
    handler: async ({ filePath, oldString, newString }) => {
      const actionResult = await executeAction({
        kind: 'coding_apply_patch',
        input: {
          filePath,
          oldString,
          newString,
        },
      }, 'coding_apply_patch')
      const structured = actionResult.structuredContent as Record<string, unknown> | undefined
      const backendResult = structured?.backendResult as Record<string, unknown> | undefined

      if (structured?.status !== 'executed' || !backendResult) {
        return actionResult
      }

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
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('coding_compress_context'),
    schema: {
      goal: z.string().describe('Current high-level goal.'),
      filesSummary: z.string().describe('Summary of relevant files.'),
      recentResultSummary: z.string().describe('Summary of the last few command executions.'),
      unresolvedIssues: z.string().describe('Any known open issues or blockers.'),
      nextStepRecommendation: z.string().describe('Immediate next logical step.'),
    },
    handler: async ({ goal, filesSummary, recentResultSummary, unresolvedIssues, nextStepRecommendation }) => {
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
  })

  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('coding_report_status'),
    schema: {
      status: z.enum(['completed', 'in_progress', 'blocked', 'failed', 'auto']).describe('Current execution phase status, or "auto" to derive it from recent coding state.'),
      summary: z.string().describe('Brief status summary.'),
      filesTouched: z.array(z.string()).describe('List of files modified.'),
      commandsRun: z.array(z.string()).describe('List of terminal commands executed.'),
      checks: z.array(z.string()).describe('Results of specific validation checks.'),
      nextStep: z.string().describe('Next suggested step or reason for blocking.'),
    },
    handler: async ({ status, summary, filesTouched, commandsRun, checks, nextStep }) => {
      const result = await primitives.reportStatus(status, summary, filesTouched, commandsRun, checks, nextStep)

      // Evidence Capture: coding_report_status
      captureVerificationEvidence(
        runtime,
        {
          kind: 'status_report',
          source: 'coding_report_status',
          confidence: 0.8, // self-reported, advisory only
          summary: `Coding execution report generated: ${result.summary}`,
          blockingEligible: false,
          observed: {
            status: result.status,
            summary: result.summary,
            filesTouchedCount: filesTouched.length,
            commandsRunCount: commandsRun.length,
          },
        },
        `Coding report: ${result.summary}`,
      )

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
  })

  // --- coding_write_file ---
  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('coding_write_file'),
    schema: {
      filePath: z.string().min(1).describe('Workspace-relative file path to create or overwrite.'),
      content: z.string().describe('Full file content to write.'),
      overwrite: z.boolean().optional().describe('If true, overwrite existing file. If false (default), fail if file exists.'),
    },
    handler: async ({ filePath, content, overwrite }) => {
      // Safety: route through executeAction for approval policy
      const result = await executeAction({
        kind: 'coding_write_file' as any,
        input: { filePath, content, overwrite: overwrite ?? false },
      }, 'coding_write_file')

      if (result.content) {
        return result
      }

      const writeResult = await primitives.writeFile(filePath, content)

      captureVerificationEvidence(runtime, {
        kind: 'coding_review',
        source: 'coding_write_file',
        confidence: 0.9,
        summary: writeResult.created
          ? `Created new file: ${filePath} (${writeResult.bytesWritten} bytes)`
          : `Overwrote file: ${filePath} (${writeResult.bytesWritten} bytes)`,
        blockingEligible: false,
        observed: writeResult,
      }, `Write file: ${filePath}`)

      const summary = writeResult.created
        ? `✅ Created: ${filePath} (${writeResult.bytesWritten} bytes)`
        : `✅ Overwritten: ${filePath} (${writeResult.bytesWritten} bytes)`

      return {
        content: [textContent(summary)],
        structuredContent: buildCodingToolStructuredContent({
          toolName: 'coding_write_file',
          backendResult: writeResult,
        }),
      }
    },
  })

  // --- coding_list_files ---
  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('coding_list_files'),
    schema: {
      pattern: z.string().optional().describe('Glob pattern to match files. Default: "**/*". Examples: "**/*.ts", "src/**/*.vue"'),
      excludePatterns: z.array(z.string()).optional().describe('Glob patterns to exclude. Default: node_modules, .git, dist, build.'),
      maxResults: z.number().int().min(1).max(2000).optional().describe('Maximum results to return. Default: 500, max: 2000.'),
    },
    handler: async ({ pattern, excludePatterns, maxResults }) => {
      const result = await primitives.listFiles({ pattern, excludePatterns, maxResults })

      const fileList = result.files
        .map(f => `${f.isDirectory ? '📁' : '📄'} ${f.path}`)
        .join('\n')

      const summary = [
        `Found ${result.totalFound} items${result.truncated ? ' (truncated)' : ''}:`,
        fileList,
      ].join('\n')

      return {
        content: [textContent(summary)],
        structuredContent: buildCodingToolStructuredContent({
          toolName: 'coding_list_files',
          backendResult: result,
        }),
      }
    },
  })

  // --- coding_agentic_run ---
  registerToolWithDescriptor(server, {
    descriptor: requireDescriptor('coding_agentic_run'),
    schema: {
      goal: z.string().min(1).describe('The coding task to accomplish autonomously.'),
      model: z.string().optional().describe('LLM model override (default: AIRI_AGENT_MODEL env var).'),
      maxTurns: z.number().int().min(1).max(100).optional().describe('Maximum LLM turns. Default: 50.'),
      approvalMode: z.enum(['auto', 'per_mutation']).optional().describe('Approval mode. Default: auto.'),
    },
    handler: async (input: { goal: string, model?: string, maxTurns?: number, approvalMode?: 'auto' | 'per_mutation' }) => {
      return executeAction({ kind: 'coding_agentic_run', input }, 'coding_agentic_run')
    },
  })
}
