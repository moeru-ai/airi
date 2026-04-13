import { describe, expect, it } from 'vitest'

import { createTestConfig } from '../test-fixtures'
import { createLocalShellRunner } from './runner'

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
})
