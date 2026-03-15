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
      filePath: z.string().describe('Workspace-relative file path.'),
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
    'coding_apply_patch',
    'Apply a patch/replacement to a file within the workspace.',
    {
      filePath: z.string().describe('Workspace-relative file path.'),
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
