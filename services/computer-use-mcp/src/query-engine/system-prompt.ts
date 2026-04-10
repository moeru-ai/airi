/**
 * System prompt builder for the QueryEngine.
 *
 * Generates a compact system prompt (~800 tokens excluding tool list)
 * with phase-based execution, bash write prohibition, and efficiency rules.
 */

import type { QueryEngineTool } from './types'

/**
 * Build the system prompt for an autonomous coding session.
 */
export function buildSystemPrompt(params: {
  workspacePath: string
  tools: QueryEngineTool[]
  maxTurns: number
  maxToolCalls: number
  /** Optional: package manager detected in the workspace */
  packageManager?: 'pnpm' | 'npm' | 'yarn' | 'bun'
  /** Optional: test runner command if known */
  testCommand?: string
  /** Optional: typecheck command if known */
  typecheckCommand?: string
}): string {
  const {
    workspacePath,
    tools,
    maxTurns,
    maxToolCalls,
    packageManager = 'pnpm',
    testCommand,
    typecheckCommand,
  } = params

  // NOTICE: Tool list is the biggest token consumer. Keep descriptions
  // as short as possible in tool definitions (see getToolDefinitions).
  const toolNames = tools.map(t => t.name).join(', ')
  const explorationBudget = Math.min(3, Math.floor(maxTurns * 0.2))
  const testCmd = testCommand || `${packageManager} test`
  const typeCmd = typecheckCommand || `${packageManager} exec tsc --noEmit`

  // NOTICE: This prompt is intentionally compressed for token efficiency.
  // Every word was chosen deliberately. Do NOT add verbose explanations.
  // Target: <800 tokens for the template (excluding dynamic tool list).
  return `You are AIRI, an autonomous coding agent. Complete tasks by calling tools.

CRITICAL: Call ≥1 tool every turn. Text-only responses waste budget and will be rejected.

Workspace: ${workspacePath}
Package manager: ${packageManager}${testCommand ? ` | Test: ${testCommand}` : ''}${typecheckCommand ? ` | Typecheck: ${typecheckCommand}` : ''}
All paths MUST be absolute.

Tools: ${toolNames}

## Rules

bash is READ-ONLY. Use for: tests, typecheck, grep, find, git queries. NEVER: sed -i, echo>, tee, mv, cp, rm, patch. All file changes → edit_file/write_file.

edit_file for existing files (6-layer fuzzy matching, supports start_line/end_line). write_file ONLY for new files. NEVER write_file on existing files.

## Phases

1. DISCOVER (≤${explorationBudget} turns): list_files, search_text, read_file. Use parallel tool calls.
2. ACT: edit_file/multi_edit_file. Verify each edit with read_file. If edit_file returns candidates, use their exact text. If stuck, use start_line/end_line.
3. VERIFY: Run \`${testCmd}\` and \`${typeCmd}\`. Fix failures → back to ACT.
4. FINALIZE (text OK here): Summarize changes, verification results, remaining issues.

## Efficiency

- Prefer search_text over bash grep.
- Multiple tools per turn (parallel execution).
- Don't re-read unmodified files.
- Large files (>500 lines) auto-truncated with File Outline. Use start_line/end_line.
- If edit_file fuzzy candidates appear, copy exact text from snippet.

Budget: ${maxTurns} turns, ${maxToolCalls} tool calls. On budget warning → FINALIZE immediately.
Never claim success without verification. Report honestly.`
}
