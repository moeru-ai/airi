import { execSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execPath, platform } from 'node:process'

import { describe, expect, it } from 'vitest'

import { createTestConfig } from '../test-fixtures'
import {
  createLocalShellRunner,
  isPowershellShell,
  POWERSHELL_EXIT_CODE_SUFFIX,
  resolveShellInvocation,
  TERMINAL_OUTPUT_MAX_CHARS,
  WINDOWS_POWERSHELL_OUTPUT_PREFIX,
} from './runner'

const isWindows = platform === 'win32'

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
  throw new Error(`process ${pid} still alive after ${timeoutMs}ms — process was not reaped`)
}

function queryChildPids(parentPid: number): number[] {
  try {
    const stdout = execSync(
      `powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq ${parentPid} } | Select-Object -ExpandProperty ProcessId"`,
      { encoding: 'utf8', timeout: 5_000 },
    )
    return stdout
      .trim()
      .split(/\s+/)
      .map(Number)
      .filter(n => Number.isInteger(n) && n > 0)
  }
  catch {
    return []
  }
}

describe('isPowershellShell', () => {
  it('identifies Windows and Core PowerShell shell variants', () => {
    expect(isPowershellShell('powershell')).toBe(true)
    expect(isPowershellShell('powershell.exe')).toBe(true)
    expect(isPowershellShell('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')).toBe(true)
    expect(isPowershellShell('pwsh')).toBe(true)
    expect(isPowershellShell('pwsh.exe')).toBe(true)
    expect(isPowershellShell('/usr/local/bin/pwsh')).toBe(true)
    expect(isPowershellShell('powershell_core')).toBe(true)
  })

  it('distinguishes POSIX shells from PowerShell', () => {
    expect(isPowershellShell('/bin/zsh')).toBe(false)
    expect(isPowershellShell('/bin/bash')).toBe(false)
    expect(isPowershellShell('/bin/sh')).toBe(false)
    expect(isPowershellShell('cmd.exe')).toBe(false)
  })
})

describe('resolveShellInvocation', () => {
  it('configures POSIX shells with login flags and detached process group on POSIX', () => {
    const invocation = resolveShellInvocation('/bin/zsh', 'echo ok', 'darwin')
    expect(invocation.args).toEqual(['-lc', 'echo ok'])
    expect(invocation.detached).toBe(true)
    expect(invocation.windowsHide).toBe(false)
  })

  it('configures PowerShell on Linux/macOS with Command and detached process group', () => {
    const invocation = resolveShellInvocation('pwsh', 'echo ok', 'linux')
    expect(invocation.args).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `echo ok${POWERSHELL_EXIT_CODE_SUFFIX}`,
    ])
    expect(invocation.detached).toBe(true)
    expect(invocation.windowsHide).toBe(false)
  })

  it('configures PowerShell on Windows with UTF-8 prefix, no detachment, and hidden window', () => {
    const invocation = resolveShellInvocation('powershell.exe', 'echo ok', 'win32')
    expect(invocation.args).toEqual([
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `${WINDOWS_POWERSHELL_OUTPUT_PREFIX}echo ok${POWERSHELL_EXIT_CODE_SUFFIX}`,
    ])
    expect(invocation.detached).toBe(false)
    expect(invocation.windowsHide).toBe(true)
  })

  it('configures pwsh.exe on Windows with hidden window and no detachment', () => {
    const invocation = resolveShellInvocation('pwsh.exe', 'echo ok', 'win32')
    expect(invocation.detached).toBe(false)
    expect(invocation.windowsHide).toBe(true)
  })

  it('clearly rejects unsupported shells on Windows instead of passing POSIX login flags', () => {
    expect(() => resolveShellInvocation('cmd.exe', 'dir', 'win32')).toThrow(
      /unsupported terminal shell on Windows: "cmd\.exe"/,
    )
    expect(() => resolveShellInvocation('cmd', 'dir', 'win32')).toThrow(
      /unsupported terminal shell on Windows: "cmd"/,
    )
    expect(() => resolveShellInvocation('bash.exe', 'ls', 'win32')).toThrow(
      /unsupported terminal shell on Windows: "bash\.exe"/,
    )
  })
})

describe('createLocalShellRunner', () => {
  it('executes commands and keeps cwd sticky across calls', async () => {
    const testDir = join(tmpdir(), `terminal-cwd-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })

    try {
      const runner = createLocalShellRunner(createTestConfig())
      const checkCwdCommand = isWindows ? '(Get-Location).Path' : 'pwd'

      const first = await runner.execute({
        command: checkCwdCommand,
        cwd: testDir,
      })
      const second = await runner.execute({
        command: checkCwdCommand,
      })

      expect(first.exitCode).toBe(0)
      expect(first.effectiveCwd).toBe(testDir)
      expect(first.stdout.trim()).toContain(testDir.split('\\').at(-1) || testDir)
      expect(second.effectiveCwd).toBe(testDir)
      expect(second.stdout.trim()).toContain(testDir.split('\\').at(-1) || testDir)
      expect(runner.getState().effectiveCwd).toBe(testDir)
    }
    finally {
      rmSync(testDir, { recursive: true, force: true })
    }
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
    const command = isWindows
      ? '[Console]::Out.Write((\'o\' * 20000)); [Console]::Error.Write((\'e\' * 20000))'
      : `${JSON.stringify(execPath)} -e "process.stdout.write('o'.repeat(20000)); process.stderr.write('e'.repeat(20000))"`

    const result = await runner.execute({
      command,
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
    const checkCwdCommand = isWindows ? '(Get-Location).Path' : 'pwd'
    await runner.execute({
      command: checkCwdCommand,
      cwd: tmpdir(),
    })

    const reset = runner.resetState('test reset')
    expect(reset.effectiveCwd).toBe(process.cwd())
    expect(reset.lastExitCode).toBeUndefined()
    expect(reset.lastCommandSummary).toBeUndefined()
  })

  // Spawned detached on POSIX so the shell leads a process group, allowing
  // timeout to reap background grandchildren rather than leaving them orphaned.
  it('reaps background grandchildren when a command times out', { skip: isWindows }, async () => {
    const runner = createLocalShellRunner(createTestConfig({
      terminalShell: '/bin/zsh',
      timeoutMs: 300,
    }))

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

  describe.skipIf(!isWindows)('createLocalShellRunner on Windows PowerShell', () => {
    it('executes a command and captures its output', async () => {
      const runner = createLocalShellRunner(createTestConfig({ terminalShell: 'powershell.exe' }))

      const result = await runner.execute({
        command: 'Write-Output "windows-terminal-ok"',
      })

      expect(result.exitCode).toBe(0)
      expect(result.timedOut).toBe(false)
      expect(result.stdout).toContain('windows-terminal-ok')
      expect(runner.getState().lastExitCode).toBe(0)
    })

    it('rejects execution when configured with an unsupported shell on Windows', async () => {
      const runner = createLocalShellRunner(createTestConfig({ terminalShell: 'cmd.exe' }))

      await expect(runner.execute({ command: 'dir' })).rejects.toThrow(
        /unsupported terminal shell on Windows: "cmd\.exe"/,
      )
    })

    it('propagates explicit exit codes in PowerShell scripts', async () => {
      const runner = createLocalShellRunner(createTestConfig({ terminalShell: 'powershell.exe' }))

      const result = await runner.execute({
        command: 'exit 7',
      })

      expect(result.exitCode).toBe(7)
      expect(runner.getState().lastExitCode).toBe(7)
    })

    it('propagates native command exit codes through the wrapper', async () => {
      const runner = createLocalShellRunner(createTestConfig({ terminalShell: 'powershell.exe' }))

      const result = await runner.execute({
        command: 'cmd.exe /c exit 8',
      })

      expect(result.exitCode).toBe(8)
      expect(runner.getState().lastExitCode).toBe(8)
    })

    it('does not produce false-positive failures from stale $LASTEXITCODE after successful command', async () => {
      const runner = createLocalShellRunner(createTestConfig({ terminalShell: 'powershell.exe' }))

      const result = await runner.execute({
        command: 'cmd.exe /c exit 8; Write-Output "subsequent-success"',
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('subsequent-success')
      expect(runner.getState().lastExitCode).toBe(0)
    })

    it('handles trailing comments on native commands without swallowing exit wrapper', async () => {
      const runner = createLocalShellRunner(createTestConfig({ terminalShell: 'powershell.exe' }))

      // Trailing comment on native failure must still propagate exit code 8
      const failWithComment = await runner.execute({
        command: 'cmd.exe /c exit 8 # trailing comment on failure',
      })
      expect(failWithComment.exitCode).toBe(8)

      // Trailing comment on success must succeed
      const okWithComment = await runner.execute({
        command: 'Write-Output "comment-ok" # trailing comment',
      })
      expect(okWithComment.exitCode).toBe(0)
      expect(okWithComment.stdout).toContain('comment-ok')
    })

    it('handles multiline scripts with comments and preserves status of final statement', async () => {
      const runner = createLocalShellRunner(createTestConfig({ terminalShell: 'powershell.exe' }))

      // Multiline script where final statement succeeds
      const multilineSuccess = await runner.execute({
        command: 'Write-Output "line1" # comment 1\ncmd.exe /c exit 8 # comment 2\nWrite-Output "line3" # comment 3',
      })
      expect(multilineSuccess.exitCode).toBe(0)
      expect(multilineSuccess.stdout).toContain('line1')
      expect(multilineSuccess.stdout).toContain('line3')

      // Multiline script ending with a failing native command
      const multilineFail = await runner.execute({
        command: 'Write-Output "step 1" # ok\ncmd.exe /c exit 9 # failed at end',
      })
      expect(multilineFail.exitCode).toBe(9)
    })

    it('handles trailing newlines without altering command exit status', async () => {
      const runner = createLocalShellRunner(createTestConfig({ terminalShell: 'powershell.exe' }))

      const trailingNewlines = await runner.execute({
        command: 'Write-Output "newlines-ok"\n\n\n',
      })
      expect(trailingNewlines.exitCode).toBe(0)
      expect(trailingNewlines.stdout).toContain('newlines-ok')
    })

    it('reports cmdlet failures as non-zero exit codes', async () => {
      const runner = createLocalShellRunner(createTestConfig({ terminalShell: 'powershell.exe' }))

      const result = await runner.execute({
        command: 'Get-Item "C:\\definitely-missing-file-for-terminal-test-12345"',
      })

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr.length).toBeGreaterThan(0)
    })

    it('propagates stderr from native commands', async () => {
      const runner = createLocalShellRunner(createTestConfig({ terminalShell: 'powershell.exe' }))

      const result = await runner.execute({
        command: 'cmd.exe /c "echo windows-stderr-sentinel 1>&2"',
      })

      expect(result.exitCode).toBe(0)
      expect(result.stderr).toContain('windows-stderr-sentinel')
    })

    it('decodes UTF-8 multilingual output properly', async () => {
      const runner = createLocalShellRunner(createTestConfig({ terminalShell: 'powershell.exe' }))

      const result = await runner.execute({
        command: 'Write-Output "中文编码测试 UTF-8 🚀"',
      })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain('中文编码测试 UTF-8 🚀')
    })

    it('handles paths with spaces and quoted command arguments correctly', async () => {
      const spaceDir = join(tmpdir(), `terminal space dir ${Date.now()}`)
      mkdirSync(spaceDir, { recursive: true })

      try {
        const runner = createLocalShellRunner(createTestConfig({ terminalShell: 'powershell.exe' }))

        const result = await runner.execute({
          command: 'Write-Output \'quoted text with \'\'nested single\'\' and "double" quotes\'',
          cwd: spaceDir,
        })

        expect(result.exitCode).toBe(0)
        expect(result.effectiveCwd).toBe(spaceDir)
        expect(result.stdout).toContain('quoted text with \'nested single\' and "double" quotes')
      }
      finally {
        rmSync(spaceDir, { recursive: true, force: true })
      }
    })

    it('times out a long command, reports 124, and keeps the session usable', async () => {
      const runner = createLocalShellRunner(createTestConfig({
        terminalShell: 'powershell.exe',
        timeoutMs: 300,
      }))

      const result = await runner.execute({
        command: 'Start-Sleep -Seconds 30',
      })

      expect(result.timedOut).toBe(true)
      expect(result.exitCode).toBe(124)
      expect(result.stderr).toContain('process timeout after 300ms')

      const followUp = await runner.execute({
        command: 'Write-Output "still-alive"',
        timeoutMs: 5_000,
      })
      expect(followUp.exitCode).toBe(0)
      expect(followUp.stdout).toContain('still-alive')
    })

    it('documents Windows timeout process reaping boundary: reaps shell but records surviving child processes', async () => {
      // Spawn a controlled child process through PowerShell.
      // On Windows, child.kill() invokes TerminateProcess on powershell.exe, but
      // child processes spawned by powershell survive as orphans.
      const childScript = `& "${execPath}" -e "setInterval(()=>{}, 1000)"`
      const prefix = WINDOWS_POWERSHELL_OUTPUT_PREFIX
      const suffix = POWERSHELL_EXIT_CODE_SUFFIX

      const { spawn: rawSpawn } = await import('node:child_process')
      const child = rawSpawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `${prefix}${childScript}${suffix}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })

      const psPid = child.pid
      expect(psPid).toBeDefined()

      let childPids: number[] = []
      try {
        // Wait for child to spawn
        await new Promise(r => setTimeout(r, 1_500))
        if (psPid != null) {
          childPids = queryChildPids(psPid)
        }

        // Direct shell process termination:
        child.kill('SIGTERM')
        await new Promise(r => setTimeout(r, 500))

        // Direct PowerShell process is reaped
        if (psPid != null) {
          await expectProcessReaped(psPid, 2_000)
        }

        // Document empirical boundary: child processes survived TerminateProcess
        if (childPids.length > 0) {
          const survivingPids = childPids.filter((pid) => {
            try {
              process.kill(pid, 0)
              return true
            }
            catch {
              return false
            }
          })
          // At least one child (node.exe or conhost.exe) survives on Windows without Job Objects
          expect(survivingPids.length).toBeGreaterThan(0)
        }
      }
      finally {
        // Strictly clean up any residual child processes so tests never leak
        for (const pid of childPids) {
          try {
            execSync(`taskkill /F /PID ${pid} > nul 2>&1`)
          }
          catch {}
        }
      }
    }, 15_000)
  })
})
