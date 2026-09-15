import type { Signals } from 'node:process'

import process from 'node:process'

import { spawn } from 'node:child_process'

export interface TimedProcessResult {
  exitCode: number | null
  signal: Signals | null
  timedOut: boolean
}

function signalProcessGroup(pid: number, signal: Signals | 0): boolean {
  try {
    process.kill(-pid, signal)
    return true
  }
  catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
    if (code === 'ESRCH')
      return false
    throw error
  }
}

function isProcessGroupActive(pid: number): boolean {
  return signalProcessGroup(pid, 0)
}

/**
 * Stops a detached process group and waits until its child processes are gone.
 *
 * The function sends the requested signal first. It sends SIGKILL after a one-second grace period.
 */
export async function stopProcessGroup(pid: number, signal: Signals): Promise<void> {
  // Electron owns renderer and utility children. One group signal keeps their shutdown order visible.
  if (!signalProcessGroup(pid, signal))
    return

  if (signal !== 'SIGKILL') {
    await new Promise(resolveDelay => setTimeout(resolveDelay, 1_000))
    if (isProcessGroupActive(pid))
      signalProcessGroup(pid, 'SIGKILL')
  }

  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!isProcessGroupActive(pid))
      return
    await new Promise(resolveDelay => setTimeout(resolveDelay, 20))
  }

  throw new Error(`Process group ${pid} remained active after SIGKILL`)
}

/**
 * Runs one detached launch process and stops its full process group after the smoke-test window.
 *
 * The returned promise waits for forced cleanup when the wrapper exits before its child processes.
 *
 * @param command - Executable that owns the detached process group.
 * @param args - Arguments for the executable.
 * @param environment - Environment for the executable and its child processes.
 * @param beforeTimeoutStop - Optional cleanup that must occur before process signals.
 * @param timeoutMs - Smoke-test window in milliseconds.
 * @default 15000
 */
export async function runTimedProcess(
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  beforeTimeoutStop?: () => Promise<void>,
  timeoutMs = 15_000,
): Promise<TimedProcessResult> {
  return await new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, {
      detached: true,
      env: environment,
      stdio: 'inherit',
    })

    let timedOut = false
    let settled = false
    let stopPromise: Promise<void> | undefined
    const resolveOnce = (result: TimedProcessResult) => {
      if (settled)
        return
      settled = true
      resolveProcess(result)
    }
    const rejectOnce = (error: unknown) => {
      if (settled)
        return
      settled = true
      rejectProcess(error)
    }

    const timeout = setTimeout(() => {
      timedOut = true
      stopPromise = (async () => {
        await beforeTimeoutStop?.()
        if (child.pid !== undefined)
          await stopProcessGroup(child.pid, 'SIGTERM')
      })()
      stopPromise.catch(rejectOnce)
    }, timeoutMs)

    child.once('error', (error) => {
      clearTimeout(timeout)
      rejectOnce(error)
    })
    child.once('close', (exitCode, signal) => {
      clearTimeout(timeout)
      const result = { exitCode, signal, timedOut }
      if (!stopPromise) {
        stopPromise = child.pid === undefined
          ? Promise.resolve()
          : stopProcessGroup(child.pid, 'SIGTERM')
      }

      stopPromise
        .then(() => resolveOnce(result))
        .catch(rejectOnce)
    })
  })
}
