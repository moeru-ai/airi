import type { ChildProcess } from 'node:child_process'

import type {
  ApprovalGrantScope,
  ComputerUseConfig,
  TerminalCommandResult,
  TerminalExecActionInput,
  TerminalRunner,
  TerminalState,
} from '../types'

import { spawn } from 'node:child_process'
import { env, kill as killProcess, cwd as processCwd } from 'node:process'

export const TERMINAL_OUTPUT_MAX_CHARS = 16_384

/**
 * Grace period between SIGTERM and SIGKILL when reaping a timed-out command's
 * process group. Mirrors the SIGTERM -> 5s -> SIGKILL escalation already used
 * by the stage-tamagotchi desktop-overlay smoke harness.
 */
const PROCESS_GROUP_KILL_GRACE_MS = 5_000

/**
 * Signals the timed-out command's entire process group instead of only the
 * shell process.
 *
 * The shell is spawned `detached`, which makes it a process-group leader on
 * POSIX, so a negative PID reaches every descendant — including background
 * grandchildren (`cmd &`, `nohup`, long-lived servers) that a bare
 * `child.kill()` would leave orphaned when the command times out.
 *
 * Falls back to signalling just the shell process when group signalling is
 * unavailable: the group already exited, or the platform has no POSIX process
 * groups (e.g. Windows, where the detached child still receives the direct
 * signal).
 */
function signalProcessGroup(child: ChildProcess, signal: NodeJS.Signals) {
  const pid = child.pid
  if (pid != null) {
    try {
      killProcess(-pid, signal)
      return
    }
    catch {
      // group already gone, or pid is not a group leader — fall through
    }
  }

  try {
    child.kill(signal)
  }
  catch {
    // process already exited
  }
}

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
          // Become a process-group leader so a timeout can reap the whole group
          // (the shell plus any background grandchildren), not just the shell.
          detached: true,
        })

        const stdout = createOutputCapture()
        const stderr = createOutputCapture()
        let finished = false
        let timedOut = false
        let escalationTimer: ReturnType<typeof setTimeout> | undefined

        const stopTimer = setTimeout(() => {
          if (finished)
            return

          timedOut = true
          finished = true

          // Reap the command's whole process group, not just the shell, so
          // background grandchildren don't outlive the timeout. Escalate to
          // SIGKILL after a grace period if the group ignores SIGTERM.
          signalProcessGroup(child, 'SIGTERM')
          escalationTimer = setTimeout(signalProcessGroup, PROCESS_GROUP_KILL_GRACE_MS, child, 'SIGKILL')
          escalationTimer.unref()

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

        const cleanup = () => {
          clearTimeout(stopTimer)
          if (escalationTimer != null)
            clearTimeout(escalationTimer)
        }

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
          // Always clear pending timers, including the post-timeout SIGKILL
          // escalation once the group has actually exited.
          cleanup()
          if (finished)
            return

          finished = true
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
