import { execPath } from 'node:process'

import { describe, expect, it } from 'vitest'

import { createTestConfig } from '../test-fixtures'
import { createLocalShellRunner, TERMINAL_OUTPUT_MAX_CHARS } from './runner'

/**
 * Polls until `pid` no longer exists. Signal 0 probes liveness without
 * delivering a signal — it throws `ESRCH` once the process has been reaped.
 */
async function expectProcessReaped(pid: number, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
    }
    catch {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(`process ${pid} still alive after ${timeoutMs}ms — its process group was not reaped`)
}

describe('createLocalShellRunner', () => {
  it('executes commands and keeps cwd sticky across calls', async () => {
    const runner = createLocalShellRunner(createTestConfig({
      terminalShell: '/bin/zsh',
    }))

    const first = await runner.execute({
      command: 'pwd',
      cwd: '/tmp',
    })
    const second = await runner.execute({
      command: 'pwd',
    })

    expect(first.exitCode).toBe(0)
    expect(first.effectiveCwd).toBe('/tmp')
    expect(first.stdout.trim()).toContain('/tmp')
    expect(second.effectiveCwd).toBe('/tmp')
    expect(runner.getState().effectiveCwd).toBe('/tmp')
  })

  it('returns non-zero exit codes without throwing', async () => {
    const runner = createLocalShellRunner(createTestConfig())
    const result = await runner.execute({
      command: 'exit 7',
    })

    expect(result.exitCode).toBe(7)
    expect(runner.getState().lastExitCode).toBe(7)
  })

  it('bounds captured stdout and stderr for large command output', async () => {
    const runner = createLocalShellRunner(createTestConfig())
    const result = await runner.execute({
      command: `${JSON.stringify(execPath)} -e "process.stdout.write('o'.repeat(20000)); process.stderr.write('e'.repeat(20000))"`,
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toHaveLength(TERMINAL_OUTPUT_MAX_CHARS)
    expect(result.stderr).toHaveLength(TERMINAL_OUTPUT_MAX_CHARS)
    expect(result.stdoutTruncated).toBe(true)
    expect(result.stderrTruncated).toBe(true)
    expect(result.stdoutOriginalLength).toBe(20_000)
    expect(result.stderrOriginalLength).toBe(20_000)
  })

  it('resets the tracked state', async () => {
    const runner = createLocalShellRunner(createTestConfig())
    await runner.execute({
      command: 'pwd',
      cwd: '/tmp',
    })

    const reset = runner.resetState('test reset')
    expect(reset.effectiveCwd).toBe(process.cwd())
    expect(reset.lastExitCode).toBeUndefined()
    expect(reset.lastCommandSummary).toBeUndefined()
  })

  // ROOT CAUSE:
  //
  // `terminal_exec` ran commands under `shell -lc "..."` without `detached`, so
  // the shell shared the runner's process group. On timeout the runner called
  // `child.kill('SIGTERM')`, which signals only the shell PID. A command that
  // had forked a background grandchild (`cmd &`, `nohup`, a server) left that
  // grandchild reparented to init instead of being reaped.
  //
  // We fixed this by spawning the shell `detached` (making it a process-group
  // leader) and signalling the whole group on timeout, so background
  // grandchildren are reaped together with the shell.
  it('reaps background grandchildren when a command times out', async () => {
    const runner = createLocalShellRunner(createTestConfig({ timeoutMs: 300 }))

    // `sleep 30 &` forks a background grandchild; `$!` is its pid. The trailing
    // `sleep 30` keeps the shell busy so the runner hits its timeout.
    const result = await runner.execute({
      command: 'sleep 30 & echo "BG_PID:$!"; sleep 30',
    })

    expect(result.timedOut).toBe(true)
    expect(result.exitCode).toBe(124)

    const match = result.stdout.match(/BG_PID:(\d+)/)
    expect(match).not.toBeNull()
    const backgroundPid = Number(match?.[1])
    expect(Number.isInteger(backgroundPid)).toBe(true)

    await expectProcessReaped(backgroundPid)
  })
})
