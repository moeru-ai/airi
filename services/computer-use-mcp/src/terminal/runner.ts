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

export const TERMINAL_OUTPUT_MAX_CHARS = 16_384

interface OutputCapture {
  value: string
  originalLength: number
  truncated: boolean
}

function createOutputCapture(): OutputCapture {
  return {
    value: '',
    originalLength: 0,
    truncated: false,
  }
}

function appendOutput(capture: OutputCapture, chunk: string) {
  capture.originalLength += chunk.length

  const remaining = TERMINAL_OUTPUT_MAX_CHARS - capture.value.length
  if (remaining > 0)
    capture.value += chunk.slice(0, remaining)

  if (chunk.length > remaining || capture.originalLength > TERMINAL_OUTPUT_MAX_CHARS)
    capture.truncated = true
}

function appendTimeoutMessage(capture: OutputCapture, timeoutMs: number): OutputCapture {
  const message = `process timeout after ${timeoutMs}ms`
  const separator = capture.value ? '\n' : ''
  const combined = `${capture.value}${separator}${message}`.trim()
  const combinedOriginalLength = capture.originalLength + separator.length + message.length

  return {
    value: combined.slice(0, TERMINAL_OUTPUT_MAX_CHARS),
    originalLength: combinedOriginalLength,
    truncated: capture.truncated || combined.length > TERMINAL_OUTPUT_MAX_CHARS,
  }
}

function summarizeCommand(command: string) {
  const compact = command.replace(/\s+/g, ' ').trim()
  return compact.length > 160 ? `${compact.slice(0, 157)}...` : compact
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

        const stdout = createOutputCapture()
        const stderr = createOutputCapture()
        let finished = false
        let timedOut = false

        const stopTimer = setTimeout(() => {
          if (finished)
            return

          timedOut = true
          finished = true
          child.kill('SIGTERM')
          const timeoutStderr = appendTimeoutMessage(stderr, timeoutMs)
          resolve({
            command: input.command,
            stdout: stdout.value,
            stderr: timeoutStderr.value,
            stdoutTruncated: stdout.truncated,
            stderrTruncated: timeoutStderr.truncated,
            stdoutOriginalLength: stdout.originalLength,
            stderrOriginalLength: timeoutStderr.originalLength,
            exitCode: 124,
            effectiveCwd,
            durationMs: Date.now() - startedAt,
            timedOut: true,
          })
        }, timeoutMs)

        const cleanup = () => clearTimeout(stopTimer)

        child.stdout.on('data', (chunk) => {
          appendOutput(stdout, chunk.toString('utf-8'))
        })

        child.stderr.on('data', (chunk) => {
          appendOutput(stderr, chunk.toString('utf-8'))
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
          resolve({
            command: input.command,
            stdout: stdout.value,
            stderr: stderr.value,
            stdoutTruncated: stdout.truncated,
            stderrTruncated: stderr.truncated,
            stdoutOriginalLength: stdout.originalLength,
            stderrOriginalLength: stderr.originalLength,
            exitCode: typeof code === 'number' ? code : 1,
            effectiveCwd,
            durationMs: Date.now() - startedAt,
            timedOut,
          })
        })
      })

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
