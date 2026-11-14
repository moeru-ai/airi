import type { ChildProcess } from 'node:child_process'

import type { TerminalSpawnInput } from '@proj-airi/stage-shared/terminal-approval'

import type {
  ComputerUseConfig,
  TerminalCommandResult,
  TerminalExecActionInput,
  TerminalExecution,
  TerminalRunner,
  TerminalState,
} from '../types'

import { spawn } from 'node:child_process'
import { resolve, win32 } from 'node:path'
import { env, kill as killProcess, pid, platform, cwd as processCwd } from 'node:process'

export const TERMINAL_OUTPUT_MAX_CHARS = 16_384

export const POWERSHELL_SHELL_NAME_RE = /^(?:powershell|powershell_?core|pwsh)(?:\.exe)?$/i

/**
 * Forces UTF-8 console output encoding on Windows PowerShell so captured
 * stdout does not get mangled by OEM codepages like GBK.
 */
export const WINDOWS_POWERSHELL_OUTPUT_PREFIX = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n'

/**
 * Normalizes PowerShell exit codes across cmdlets and native executables.
 * Begins with a newline so trailing comments in user scripts cannot comment
 * out this wrapper. Tests $? ($ok) before $LASTEXITCODE to avoid stale exit
 * codes after subsequent successful statements.
 */
export const POWERSHELL_EXIT_CODE_SUFFIX
  = '\n$ok = $?; if ($ok) { exit 0 } elseif ($LASTEXITCODE -is [int] -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE } else { exit 1 }'

export function isPowershellShell(shell: string): boolean {
  return POWERSHELL_SHELL_NAME_RE.test(win32.basename(shell.trim()))
}

export interface ShellInvocation {
  args: string[]
  detached: boolean
  windowsHide: boolean
}

/**
 * Resolves shell invocation arguments and process spawning flags.
 * Rejects non-PowerShell shells on Windows to prevent passing POSIX login flags.
 */
export function resolveShellInvocation(
  shell: string,
  command: string,
  hostPlatform: NodeJS.Platform = platform,
): ShellInvocation {
  const isWin = hostPlatform === 'win32'
  if (isPowershellShell(shell)) {
    const source = command + POWERSHELL_EXIT_CODE_SUFFIX
    // Encoding setup runs outside the submitted script so using and param still lead its scope.
    // PowerShell treats typographic single quotes as delimiters too.
    const script = isWin
      ? `${WINDOWS_POWERSHELL_OUTPUT_PREFIX}& ([scriptblock]::Create('${source.replace(/['\u2018\u2019\u201A\u201B]/g, '$&$&')}'))`
      : source
    return {
      args: ['-NoProfile', '-NonInteractive', '-Command', script],
      detached: !isWin,
      windowsHide: isWin,
    }
  }

  if (isWin) {
    throw new Error(`unsupported terminal shell on Windows: "${shell}". Local shell execution on Windows requires PowerShell (powershell.exe or pwsh).`)
  }

  return {
    args: ['-lc', command],
    detached: true,
    windowsHide: false,
  }
}

/**
 * Grace period between SIGTERM and SIGKILL when reaping a timed-out command's
 * process group. Mirrors the SIGTERM -> 5s -> SIGKILL escalation already used
 * by the stage-tamagotchi desktop-overlay smoke harness.
 */
const PROCESS_GROUP_KILL_GRACE_MS = 5_000
// An inherited pipe can outlive the shell. Bound the drain without certifying a forced close.
const OUTPUT_DRAIN_MS = 1_000

/**
 * Signals the process group on POSIX systems.
 *
 * Windows Process Cleanup Boundary:
 * On Windows, child.kill() invokes Win32 TerminateProcess on the shell PID.
 * This terminates powershell.exe, but Windows does not terminate descendant
 * processes. Subprocesses spawned by the shell survive as orphans unless Job
 * Objects or taskkill /T are used. Callers must not assume full tree cleanup.
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
  const active = new Set<{ stop: () => void, lifecycle: TerminalExecution['lifecycle'] }>()
  let closing: Promise<void> | undefined
  const state: TerminalState = {
    effectiveCwd: processCwd(),
  }

  function prepare(input: TerminalExecActionInput): TerminalSpawnInput {
    const requestedCwd = input.cwd?.trim()
    const invocation = resolveShellInvocation(config.terminalShell, input.command)
    return {
      command: input.command,
      shell: config.terminalShell,
      argv: invocation.args,
      effectiveCwd: resolve(requestedCwd || state.effectiveCwd || processCwd()),
      requestedCwd,
      cwdSource: requestedCwd ? 'argument' : 'runner-state',
      timeoutMs: Math.max(1, input.timeoutMs ?? config.timeoutMs),
      executorPid: pid,
      executorPlatform: platform,
      executorCwd: processCwd(),
      detached: invocation.detached,
      windowsHide: invocation.windowsHide,
    }
  }

  function startPrepared(input: TerminalSpawnInput, signal?: AbortSignal): TerminalExecution {
    if (closing)
      throw new Error('The Terminal runner is closed.')
    signal?.throwIfAborted()
    const { effectiveCwd, timeoutMs } = input
    const { promise: lifecycle, resolve: settleLifecycle } = Promise.withResolvers<'closed' | 'unknown'>()
    const startedAt = Date.now()
    const execution = new Promise<TerminalCommandResult>((resolve, reject) => {
      let child: ReturnType<typeof spawn>
      try {
        child = spawn(input.shell, input.argv, {
          cwd: effectiveCwd,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
          detached: input.detached,
          windowsHide: input.windowsHide,
        })
      }
      catch (error) {
        // Node rejected the spawn before it returned a process. No close event can follow this synchronous failure.
        settleLifecycle('closed')
        reject(error)
        return
      }

      const stdout = createOutputCapture()
      const stderr = createOutputCapture()
      let finished = false
      let timedOut = false
      let lifecycleEnded = false
      let escalationTimer: ReturnType<typeof setTimeout> | undefined
      let drainTimer: ReturnType<typeof setTimeout> | undefined
      function boundOutputDrain(code: number | null) {
        drainTimer ??= setTimeout(() => {
          endLifecycle('unknown', code ?? child.exitCode)
          child.stdout?.destroy()
          child.stderr?.destroy()
          child.unref()
        }, OUTPUT_DRAIN_MS)
      }
      const stop = () => {
        if (lifecycleEnded || escalationTimer)
          return
        signalProcessGroup(child, 'SIGTERM')
        escalationTimer = setTimeout(signalProcessGroup, PROCESS_GROUP_KILL_GRACE_MS, child, 'SIGKILL')
        escalationTimer.unref()
      }
      const owned = { stop, lifecycle }
      active.add(owned)
      signal?.addEventListener('abort', stop, { once: true })
      if (signal?.aborted)
        stop()

      const stopTimer = setTimeout(() => {
        if (finished)
          return

        timedOut = true
        finished = true
        stop()
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

      child.stdout?.on('data', chunk => appendOutput(stdout, chunk.toString('utf-8')))
      child.stderr?.on('data', chunk => appendOutput(stderr, chunk.toString('utf-8')))
      child.on('error', (error) => {
        if (finished)
          return
        finished = true
        clearTimeout(stopTimer)
        reject(error)
      })
      child.once('exit', boundOutputDrain)
      child.once('close', code => endLifecycle('closed', code))

      function endLifecycle(status: 'closed' | 'unknown', code: number | null) {
        if (lifecycleEnded)
          return
        lifecycleEnded = true
        active.delete(owned)
        signal?.removeEventListener('abort', stop)
        clearTimeout(stopTimer)
        clearTimeout(drainTimer)
        // Forced drain does not cancel a pending POSIX process-group termination.
        if (status === 'closed' || platform === 'win32')
          clearTimeout(escalationTimer)
        settleLifecycle(status)
        if (finished)
          return
        finished = true
        if (status === 'unknown' && typeof code !== 'number') {
          reject(new Error('The terminal process did not return a confirmed exit status.'))
          return
        }
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
      }
    })
    const result = execution.then((result) => {
      state.effectiveCwd = result.effectiveCwd
      state.lastExitCode = result.exitCode
      state.lastCommandSummary = summarizeCommand(result.command)
      return result
    })
    return { result, lifecycle }
  }

  return {
    prepare,
    startPrepared,
    close: () => {
      if (!closing) {
        // Install the latch before signalling children. A timeout result does not end ownership.
        closing = Promise.resolve().then(async () => {
          const executions = [...active]
          for (const execution of executions)
            execution.stop()
          await Promise.all(executions.map(execution => execution.lifecycle))
        })
      }
      return closing
    },
    describe: () => ({
      kind: 'local-shell-runner',
      notes: [
        `Configured Shell executable: ${config.terminalShell}. Executor platform: ${platform}.`,
        'Each command starts a new background Shell process, without a terminal application.',
        'The default cwd is the previous spawn directory. Shell-internal directory changes do not persist.',
        'Relative cwd arguments resolve against the executor process directory, not the previous spawn directory.',
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
    execute: async input => startPrepared(prepare(input)).result,
  }
}
