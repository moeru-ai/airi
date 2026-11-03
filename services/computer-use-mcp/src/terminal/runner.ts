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
import { basename } from 'node:path'
import { env, kill as killProcess, platform, cwd as processCwd } from 'node:process'

export const TERMINAL_OUTPUT_MAX_CHARS = 16_384

export const POWERSHELL_SHELL_NAME_RE = /^(?:powershell|powershell_?core|pwsh)(?:\.exe)?$/i

/**
 * PowerShell writes console output in the active codepage (for example GBK on
 * zh-CN hosts), which the runner decodes as UTF-8. Forcing UTF-8 first keeps
 * captured stdout decodable.
 */
export const WINDOWS_POWERSHELL_OUTPUT_PREFIX = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; '

/**
 * PowerShell exit code wrapper:
 * In PowerShell 5.1/7, cmdlet failures surface only through `$?` ($False) and
 * do not update `$LASTEXITCODE`. Native executables update `$LASTEXITCODE`.
 *
 * Cmdlets do not reset an earlier `$LASTEXITCODE`. If a command executes a
 * failing native command followed by a successful statement, `$LASTEXITCODE`
 * remains non-zero even though the final statement succeeded ($? is $True).
 *
 * To avoid false-positive failures from stale `$LASTEXITCODE`, test `$?` ($ok) first:
 * - If the final statement succeeded ($ok), exit with 0.
 * - Otherwise ($ok is false): if a native exit code was recorded and is non-zero, exit with that code.
 * - Otherwise (cmdlet failure where $LASTEXITCODE is 0 or null), exit with 1.
 *
 * If the user's command explicitly calls `exit N`, PowerShell exits immediately and this
 * suffix is not reached.
 */
export const POWERSHELL_EXIT_CODE_SUFFIX
  = '; $ok = $?; if ($ok) { exit 0 } elseif ($LASTEXITCODE -is [int] -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE } else { exit 1 }'

export function isPowershellShell(shell: string): boolean {
  return POWERSHELL_SHELL_NAME_RE.test(basename(shell.trim()))
}

export interface ShellInvocation {
  args: string[]
  detached: boolean
  windowsHide: boolean
}

/**
 * Resolves how a command reaches the configured shell, decoupling shell dialect
 * from host operating system.
 *
 * - PowerShell on Windows (`hostPlatform === 'win32'`):
 *   PowerShell 5.1/7 rejects POSIX login flags (`-lc`). Under Node.js on Windows,
 *   `detached: true` causes PowerShell to exit 0 immediately without executing the
 *   command. We pass `-NoProfile -NonInteractive -Command`, prepend UTF-8 encoding
 *   configuration, append exit code normalization, and set `detached: false, windowsHide: true`.
 *
 * - PowerShell on POSIX (`hostPlatform !== 'win32'`, e.g. `pwsh` on Linux/macOS):
 *   Accepts `-NoProfile -NonInteractive -Command` and exit code suffix, but preserves
 *   POSIX process-group detachment (`detached: true, windowsHide: false`) so process-group
 *   timeout reaping works.
 *
 * - POSIX shells (`/bin/zsh`, `/bin/bash`, `sh`, etc.):
 *   Keep standard login-shell invocation `['-lc', command]`, with `detached: true` on POSIX
 *   for process-group leadership.
 */
export function resolveShellInvocation(
  shell: string,
  command: string,
  hostPlatform: NodeJS.Platform = platform,
): ShellInvocation {
  const isWin = hostPlatform === 'win32'
  if (isPowershellShell(shell)) {
    const prefix = isWin ? WINDOWS_POWERSHELL_OUTPUT_PREFIX : ''
    return {
      args: ['-NoProfile', '-NonInteractive', '-Command', `${prefix}${command}${POWERSHELL_EXIT_CODE_SUFFIX}`],
      detached: !isWin,
      windowsHide: isWin,
    }
  }

  return {
    args: ['-lc', command],
    detached: !isWin,
    windowsHide: isWin,
  }
}

/**
 * Grace period between SIGTERM and SIGKILL when reaping a timed-out command's
 * process group. Mirrors the SIGTERM -> 5s -> SIGKILL escalation already used
 * by the stage-tamagotchi desktop-overlay smoke harness.
 */
const PROCESS_GROUP_KILL_GRACE_MS = 5_000

/**
 * Signals the timed-out command's entire process group instead of only the
 * shell process on POSIX systems.
 *
 * The shell is spawned `detached`, which makes it a process-group leader on
 * POSIX, so a negative PID reaches every descendant — including background
 * grandchildren (`cmd &`, `nohup`, long-lived servers) that a bare
 * `child.kill()` would leave orphaned when the command times out.
 *
 * Windows Process Cleanup Boundary:
 * On Windows (`win32`), Node's `child_process` lacks POSIX process group support.
 * Calling `killProcess(-pid, signal)` throws EINVAL on Windows.
 * Calling `child.kill(signal)` invokes Win32 `TerminateProcess` on the immediate
 * child process handle. Direct child processes attached to the shell terminate
 * or exit when standard IO closes. However, background grandchildren spawned
 * asynchronously (e.g. `Start-Process`, `cmd /c start`) are detached into
 * independent Win32 processes and will NOT be reaped without Windows Job
 * Objects or `taskkill /F /T`. Callers must not assume complete grandchild
 * reaping on Windows.
 */
function signalProcessGroup(child: ChildProcess, signal: NodeJS.Signals) {
  const pid = child.pid
  if (pid != null && platform !== 'win32') {
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
      const invocation = resolveShellInvocation(config.terminalShell, input.command)

      const startedAt = Date.now()
      const result = await new Promise<TerminalCommandResult>((resolve, reject) => {
        const child = spawn(config.terminalShell, invocation.args, {
          cwd: effectiveCwd,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
          // Become a process-group leader so a timeout can reap the whole group
          // on POSIX (the shell plus any background grandchildren).
          // POSIX shells only: detached PowerShell on Windows exits 0 immediately,
          // and Windows has no POSIX process groups.
          detached: invocation.detached,
          windowsHide: invocation.windowsHide,
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

          // Reap the command's process group on POSIX, or direct child on Windows.
          // Escalate to SIGKILL after a grace period if the group ignores SIGTERM.
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
