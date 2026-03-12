/**
 * VS Code engineering controller.
 *
 * Provides deterministic, CLI-based tools for VS Code workspace control.
 * These use the `code` CLI rather than UI automation — reliable, fast,
 * and headless-friendly.
 *
 * Tool surface:
 *   vscode_open_workspace  — open a folder in VS Code
 *   vscode_open_file       — open file at specific line/column
 *   vscode_run_task        — run a VS Code / shell task in integrated terminal
 *   vscode_list_problems   — read diagnostics (errors/warnings) from workspace
 *   vscode_resolve_code_cli — detect and report the active `code` CLI path
 *
 * All tools go through the standard terminal_exec action pipeline so they
 * inherit cwd stickiness, timeout handling, approval flow, audit logging,
 * and run-state updates.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type {
  TerminalCommandResult,
  TerminalExecActionInput,
  VscodeProblem,
} from '../types'
import type { ComputerUseServerRuntime } from './runtime'

import { z } from 'zod'

import { textContent } from './content'

export interface ExecuteTerminalCommandFn {
  (
    input: TerminalExecActionInput,
    toolName: string,
  ): Promise<CallToolResult>
}

export interface RegisterVscodeToolsOptions {
  server: McpServer
  runtime: ComputerUseServerRuntime
  /** Function to execute a terminal command through the standard pipeline. */
  executeTerminalCommand: ExecuteTerminalCommandFn
}

// NOTICE: VS Code CLI path varies by installation.
// Common locations: 'code', '/usr/local/bin/code', brew cask,
// snap, flatpak. Also support Cursor ('cursor') and Insiders ('code-insiders').
const CODE_CLI_CANDIDATES = [
  'code',
  'code-insiders',
  'cursor',
] as const

/**
 * Attempt to detect the active `code` CLI binary.
 * Returns the first candidate that resolves via `which`.
 */
type CodeCliProbeResult
  = | { status: 'resolved', cli: string, path: string }
    | { status: 'missing' }
    | { status: 'passthrough', callToolResult: CallToolResult }

async function detectCodeCli(
  exec: RegisterVscodeToolsOptions['executeTerminalCommand'],
): Promise<CodeCliProbeResult> {
  for (const cli of CODE_CLI_CANDIDATES) {
    const terminal = await runTerminalCommand(exec, {
      command: `which ${cli}`,
      timeoutMs: 5_000,
    }, `vscode_resolve_code_cli_probe_${cli}`)
    if (terminal.status !== 'executed') {
      return {
        status: 'passthrough',
        callToolResult: terminal.callToolResult,
      }
    }

    if (terminal.result.exitCode === 0 && terminal.result.stdout.trim()) {
      return { status: 'resolved', cli, path: terminal.result.stdout.trim() }
    }
  }

  return { status: 'missing' }
}

export function registerVscodeTools({ server, runtime, executeTerminalCommand }: RegisterVscodeToolsOptions) {
  // Cache the detected CLI to avoid re-probing on every call
  let cachedCli: { cli: string, path: string } | undefined
  let codeCliProbeCompleted = false

  async function getCodeCli(): Promise<CodeCliProbeResult> {
    if (codeCliProbeCompleted) {
      return cachedCli
        ? { status: 'resolved', ...cachedCli }
        : { status: 'missing' }
    }

    const probe = await detectCodeCli(executeTerminalCommand)
    if (probe.status !== 'passthrough') {
      codeCliProbeCompleted = true
      cachedCli = probe.status === 'resolved'
        ? { cli: probe.cli, path: probe.path }
        : undefined
    }

    return probe
  }

  // ---------------------------------------------------------------------------
  // vscode_resolve_code_cli
  // ---------------------------------------------------------------------------

  server.tool(
    'vscode_resolve_code_cli',
    {},
    async () => {
      // Force re-probe
      cachedCli = undefined
      codeCliProbeCompleted = false
      const probe = await getCodeCli()

      if (probe.status === 'passthrough') {
        return probe.callToolResult
      }

      if (probe.status !== 'resolved') {
        return {
          isError: true,
          content: [textContent('No VS Code CLI found. Tried: code, code-insiders, cursor.')],
          structuredContent: {
            status: 'unavailable',
            triedCandidates: [...CODE_CLI_CANDIDATES],
          },
        }
      }

      runtime.stateManager.updateVscodeCli(probe)

      return {
        content: [textContent(`VS Code CLI: ${probe.cli} → ${probe.path}`)],
        structuredContent: {
          status: 'ok',
          cli: probe.cli,
          path: probe.path,
        },
      }
    },
  )

  // ---------------------------------------------------------------------------
  // vscode_open_workspace
  // ---------------------------------------------------------------------------

  server.tool(
    'vscode_open_workspace',
    {
      folderPath: z.string().min(1).describe('Absolute path to the workspace folder to open'),
      reuseWindow: z.boolean().optional().describe('Reuse existing window instead of opening new one (default: true)'),
    },
    async ({ folderPath, reuseWindow }) => {
      const probe = await getCodeCli()
      if (probe.status === 'passthrough') {
        return probe.callToolResult
      }
      if (probe.status !== 'resolved') {
        return {
          isError: true,
          content: [textContent('VS Code CLI not available.')],
          structuredContent: { status: 'unavailable' },
        }
      }

      const reuseFlag = (reuseWindow ?? true) ? '--reuse-window' : '--new-window'
      const command = `${probe.cli} ${reuseFlag} ${JSON.stringify(folderPath)}`
      const terminal = await runTerminalCommand(executeTerminalCommand, {
        command,
        timeoutMs: 15_000,
      }, 'vscode_open_workspace')

      if (terminal.status !== 'executed') {
        return terminal.callToolResult
      }

      const result = terminal.result

      if (result.exitCode !== 0) {
        return {
          isError: true,
          content: [textContent(`Failed to open workspace: ${result.stderr || result.stdout}`)],
          structuredContent: {
            status: 'error',
            exitCode: result.exitCode,
            stderr: result.stderr,
          },
        }
      }

      runtime.stateManager.updateVscodeCli(probe)
      runtime.stateManager.updateVscodeWorkspace(folderPath)

      return {
        content: [textContent(`Opened workspace: ${folderPath}`)],
        structuredContent: {
          status: 'ok',
          folderPath,
          cli: probe.cli,
        },
      }
    },
  )

  // ---------------------------------------------------------------------------
  // vscode_open_file
  // ---------------------------------------------------------------------------

  server.tool(
    'vscode_open_file',
    {
      filePath: z.string().min(1).describe('Absolute path to the file to open'),
      line: z.number().int().min(1).optional().describe('Line number to jump to (1-based)'),
      column: z.number().int().min(1).optional().describe('Column number to jump to (1-based)'),
      reuseWindow: z.boolean().optional().describe('Reuse existing window (default: true)'),
    },
    async ({ filePath, line, column, reuseWindow }) => {
      const probe = await getCodeCli()
      if (probe.status === 'passthrough') {
        return probe.callToolResult
      }
      if (probe.status !== 'resolved') {
        return {
          isError: true,
          content: [textContent('VS Code CLI not available.')],
          structuredContent: { status: 'unavailable' },
        }
      }

      // code --goto file:line:column
      let target = filePath
      if (line) {
        target += `:${line}`
        if (column)
          target += `:${column}`
      }

      const reuseFlag = (reuseWindow ?? true) ? '--reuse-window' : ''
      const command = `${probe.cli} --goto ${JSON.stringify(target)} ${reuseFlag}`.trim()
      const terminal = await runTerminalCommand(executeTerminalCommand, {
        command,
        timeoutMs: 10_000,
      }, 'vscode_open_file')

      if (terminal.status !== 'executed') {
        return terminal.callToolResult
      }

      const result = terminal.result

      if (result.exitCode !== 0) {
        return {
          isError: true,
          content: [textContent(`Failed to open file: ${result.stderr || result.stdout}`)],
          structuredContent: {
            status: 'error',
            exitCode: result.exitCode,
            stderr: result.stderr,
          },
        }
      }

      runtime.stateManager.updateVscodeCli(probe)
      runtime.stateManager.updateVscodeCurrentFile({
        filePath,
        line,
        column,
      })

      return {
        content: [textContent(`Opened ${target} in ${probe.cli}`)],
        structuredContent: {
          status: 'ok',
          filePath,
          line,
          column,
          cli: probe.cli,
        },
      }
    },
  )

  // ---------------------------------------------------------------------------
  // vscode_run_task
  // ---------------------------------------------------------------------------

  server.tool(
    'vscode_run_task',
    {
      command: z.string().min(1).describe('Shell command to run (e.g. "pnpm typecheck", "pnpm test:run")'),
      cwd: z.string().optional().describe('Working directory for the command'),
      timeoutMs: z.number().int().min(1_000).max(300_000).optional().describe('Timeout in milliseconds (default: 60000)'),
    },
    async ({ command, cwd, timeoutMs }) => {
      const timeout = timeoutMs ?? 60_000
      const terminal = await runTerminalCommand(executeTerminalCommand, {
        command,
        cwd,
        timeoutMs: timeout,
      }, 'vscode_run_task')

      if (terminal.status !== 'executed') {
        return terminal.callToolResult
      }

      const result = terminal.result

      // Parse common patterns from output
      const hasErrors = result.exitCode !== 0
      const outputLines = result.stdout.split('\n')
      const stderrLines = result.stderr.split('\n').filter(Boolean)

      runtime.stateManager.updateVscodeTaskResult({
        command,
        cwd: result.effectiveCwd,
        exitCode: result.exitCode,
      })

      return {
        content: [
          textContent(
            hasErrors
              ? `Task failed (exit ${result.exitCode}):\n${result.stderr || result.stdout}`
              : `Task completed:\n${result.stdout.slice(0, 2000)}`,
          ),
        ],
        structuredContent: {
          status: hasErrors ? 'failed' : 'ok',
          command,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          outputLineCount: outputLines.length,
          stderrLineCount: stderrLines.length,
          cwd: result.effectiveCwd,
        },
      }
    },
  )

  // ---------------------------------------------------------------------------
  // vscode_list_problems
  // ---------------------------------------------------------------------------

  server.tool(
    'vscode_list_problems',
    {
      cwd: z.string().optional().describe('Project root to run diagnostics from'),
      checkCommand: z.string().optional().describe('Diagnostic command (default: "pnpm typecheck 2>&1")'),
      maxLines: z.number().int().min(10).max(500).optional().describe('Maximum output lines to return (default: 200)'),
    },
    async ({ cwd, checkCommand, maxLines }) => {
      const command = checkCommand ?? 'pnpm typecheck 2>&1'
      const limit = maxLines ?? 200
      const terminal = await runTerminalCommand(executeTerminalCommand, {
        command,
        cwd,
        timeoutMs: 120_000,
      }, 'vscode_list_problems')

      if (terminal.status !== 'executed') {
        return terminal.callToolResult
      }

      const result = terminal.result

      const combined = `${result.stdout}\n${result.stderr}`.trim()
      const lines = combined.split('\n')
      const truncated = lines.length > limit
      const output = truncated ? lines.slice(0, limit).join('\n') : combined

      // Parse TypeScript-style error lines: "src/foo.ts(10,5): error TS2345: ..."
      const errorPattern = /^([^(]+)\((\d+),(\d+)\): +(error|warning) +(TS\d+): +(\S.*)$/
      const problems: VscodeProblem[] = []
      for (const line of lines) {
        const match = line.match(errorPattern)
        if (match) {
          problems.push({
            file: match[1],
            line: Number(match[2]),
            column: Number(match[3]),
            severity: match[4],
            code: match[5],
            message: match[6],
          })
        }
      }

      // Also try "file:line:col - error TS..." format (vue-tsc)
      const vueTscPattern = /^([^:]+):(\d+):(\d+) +- +(error|warning) +(TS\d+): +(\S.*)$/
      for (const line of lines) {
        const match = line.match(vueTscPattern)
        if (match && !problems.some(p => p.file === match[1] && p.line === Number(match[2]))) {
          problems.push({
            file: match[1],
            line: Number(match[2]),
            column: Number(match[3]),
            severity: match[4],
            code: match[5],
            message: match[6],
          })
        }
      }

      runtime.stateManager.updateVscodeTaskResult({
        command,
        cwd: result.effectiveCwd,
        exitCode: result.exitCode,
      })
      runtime.stateManager.updateVscodeProblems({
        command,
        cwd: result.effectiveCwd,
        problemCount: problems.length,
        problems,
      })

      return {
        content: [
          textContent(
            result.exitCode === 0
              ? 'No problems found.'
              : `Found ${problems.length} problem(s):\n${output}`,
          ),
        ],
        structuredContent: {
          status: result.exitCode === 0 ? 'ok' : 'has_problems',
          exitCode: result.exitCode,
          problemCount: problems.length,
          problems,
          output,
          truncated,
          command,
          cwd: result.effectiveCwd,
        },
      }
    },
  )
}

type TerminalCommandExecution
  = | { status: 'executed', result: TerminalCommandResult }
    | { status: 'passthrough', callToolResult: CallToolResult }

async function runTerminalCommand(
  executeTerminalCommand: ExecuteTerminalCommandFn,
  input: TerminalExecActionInput,
  toolName: string,
): Promise<TerminalCommandExecution> {
  const result = await executeTerminalCommand(input, toolName)
  const structured = toRecord(result.structuredContent)
  const backendResult = toRecord(structured?.backendResult)

  if (!structured || structured.status !== 'executed' || !backendResult) {
    return {
      status: 'passthrough',
      callToolResult: result,
    }
  }

  return {
    status: 'executed',
    result: {
      command: typeof backendResult.command === 'string' ? backendResult.command : input.command,
      stdout: typeof backendResult.stdout === 'string' ? backendResult.stdout : '',
      stderr: typeof backendResult.stderr === 'string' ? backendResult.stderr : '',
      exitCode: typeof backendResult.exitCode === 'number' ? backendResult.exitCode : 1,
      effectiveCwd: typeof backendResult.effectiveCwd === 'string' ? backendResult.effectiveCwd : (input.cwd ?? ''),
      durationMs: typeof backendResult.durationMs === 'number' ? backendResult.durationMs : 0,
      timedOut: Boolean(backendResult.timedOut),
    },
  }
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  return value as Record<string, unknown>
}
