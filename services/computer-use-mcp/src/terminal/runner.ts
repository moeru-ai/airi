import type {
  ApprovalGrantScope,
  ComputerUseConfig,
  TerminalCommandResult,
  TerminalExecActionInput,
  TerminalRunner,
  TerminalState,
} from '../types'

import { spawn } from 'node:child_process'
import { env, cwd as processCwd } from 'node:process'

/** Matches runs of whitespace for command summary trimming. */
const WHITESPACE_RUN_RE = /\s+/g

function summarizeCommand(command: string) {
  const compact = command.replace(WHITESPACE_RUN_RE, ' ').trim()
  return compact.length > 160 ? `${compact.slice(0, 157)}...` : compact
}

/**
 * Detects if a shell command string contains a `cd` directive that would
 * cause CWD drift. Each spawn is a fresh subprocess, so 'cd' commands have
 * no effect on the next terminal_exec call's working directory.
 *
 * Pattern matches `cd` appearing at statement start, after ;|& separators,
 * or after newlines — avoiding false-positive matches on words containing "cd".
 */
const CD_DIRECTIVE_RE = /(?:^|[;&|\n])\s*cd\s/

function containsCdDirective(command: string): boolean {
  return CD_DIRECTIVE_RE.test(command)
}

export function createLocalShellRunner(config: ComputerUseConfig): TerminalRunner {
  const state: TerminalState = {
    effectiveCwd: processCwd(),
  }

  return {
    describe: () => ({
      kind: 'local-shell-runner',
      notes: [
        'commands execute in a background local shell process',
        'Terminal.app is not used as the execution substrate',
        'cwd is sticky across calls unless the next tool call overrides it explicitly',
      ],
    }),
    getState: () => ({ ...state }),
    resetState: (_reason?: string) => {
      state.effectiveCwd = processCwd()
      delete state.lastExitCode
      delete state.lastCommandSummary
      delete state.approvalGrantedScope
      delete state.approvalSessionActive
      return { ...state }
    },
    execute: async (input: TerminalExecActionInput) => {
      const effectiveCwd = input.cwd?.trim() || state.effectiveCwd || processCwd()
      const timeoutMs = Math.max(1, input.timeoutMs ?? config.timeoutMs)

      const startedAt = Date.now()
      const result = await new Promise<TerminalCommandResult>((resolve, reject) => {
        const child = spawn(config.terminalShell, ['-lc', input.command], {
          cwd: effectiveCwd,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        })

        let stdout = ''
        let stderr = ''
        let finished = false
        let timedOut = false

        const stopTimer = setTimeout(() => {
          if (finished)
            return

          timedOut = true
          finished = true
          child.kill('SIGTERM')
          resolve({
            command: input.command,
            stdout,
            stderr: `${stderr}${stderr ? '\n' : ''}process timeout after ${timeoutMs}ms`.trim(),
            exitCode: 124,
            effectiveCwd,
            durationMs: Date.now() - startedAt,
            timedOut: true,
          })
        }, timeoutMs)

        const cleanup = () => clearTimeout(stopTimer)

        child.stdout.on('data', (chunk) => {
          stdout += chunk.toString('utf-8')
        })

        child.stderr.on('data', (chunk) => {
          stderr += chunk.toString('utf-8')
        })

        child.on('error', (error) => {
          if (finished)
            return

          finished = true
          cleanup()
          reject(error)
        })

        child.on('close', (code) => {
          if (finished)
            return

          finished = true
          cleanup()

          // NOTICE: Truncate huge outputs to prevent context window bloat.
          // Keep head (first 40k chars) + tail (last 10k chars) for maximum context.
          const MAX_OUTPUT_CHARS = 100_000
          const HEAD_CHARS = 40_000
          const TAIL_CHARS = 10_000

          const truncateOutput = (output: string, label: string): string => {
            if (output.length <= MAX_OUTPUT_CHARS) return output
            const head = output.slice(0, HEAD_CHARS)
            const tail = output.slice(-TAIL_CHARS)
            const omitted = output.length - HEAD_CHARS - TAIL_CHARS
            return `${head}\n\n[... ${omitted} characters omitted from ${label} ...]\n\n${tail}`
          }

          resolve({
            command: input.command,
            stdout: truncateOutput(stdout, 'stdout'),
            stderr: truncateOutput(stderr, 'stderr'),
            exitCode: typeof code === 'number' ? code : 1,
            effectiveCwd,
            durationMs: Date.now() - startedAt,
            timedOut,
          })
        })
      })

      // NOTICE: Each spawn is an independent subprocess — `cd` commands change the shell's
      // working directory for that invocation only. The next tool call will still start from
      // the same effectiveCwd. We detect this to nudge the model before it makes false
      // assumptions about persistent shell state.
      if (containsCdDirective(input.command)) {
        const notice = `[NOTICE: CWD changes via 'cd' do not persist between tool calls — each terminal_exec runs in a new subprocess starting from cwd=${effectiveCwd}. Pass an explicit 'cwd' parameter to target a different directory on the next call.]`
        result.stderr = result.stderr
          ? `${result.stderr}\n${notice}`
          : notice
      }

      state.effectiveCwd = result.effectiveCwd
      state.lastExitCode = result.exitCode
      state.lastCommandSummary = summarizeCommand(result.command)
      return result
    },
  }
}

export function withApprovalGrant(state: TerminalState, granted: boolean, scope: ApprovalGrantScope = 'terminal_and_apps'): TerminalState {
  return {
    ...state,
    approvalSessionActive: granted,
    approvalGrantedScope: granted ? scope : undefined,
  }
}
