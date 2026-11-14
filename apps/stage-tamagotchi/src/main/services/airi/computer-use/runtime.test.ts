import process from 'node:process'

import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { binaryPath } from '@auv-js/cli/binary'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createComputerUseRuntime } from './runtime'

describe('computer use runtime', () => {
  let directory: string
  let runtime: ReturnType<typeof createComputerUseRuntime>
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'airi-cu-test-'))
    await mkdir(join(directory, 'store'))
    runtime = createComputerUseRuntime({ binaryPath: binaryPath(), storeRoot: join(directory, 'store'), requireAttribution: false })
  })
  afterEach(async () => {
    await runtime.dispose()
    await rm(directory, { recursive: true, force: true })
  })

  it('rejects shell commands, route overrides, and invalid input before starting AUV', async () => {
    await expect(runtime.run({ argv: ['serve', '--help'] })).rejects.toThrow('Use invoke')
    await expect(runtime.run({ argv: ['invoke', 'application.activate', '--device=other'] })).rejects.toThrow('managed by AIRI')
    await expect(runtime.run({ argv: ['invoke', 'window.list', '--store-root', 'elsewhere'] })).rejects.toThrow('managed by AIRI')
    await expect(runtime.run({ argv: ['invoke', 'window.list', '--credential-stdin'] })).rejects.toThrow('managed by AIRI')
    await expect(runtime.run({ argv: ['invoke', 'scan.frame'] })).rejects.toThrow('Use invoke')
    await expect(runtime.run({ argv: ['invoke', 'screen.findText', 'OK'] })).rejects.toThrow('Use invoke')
    await expect(runtime.run({ argv: ['invoke', 5] })).rejects.toThrow()
  })

  it('requires attribution by default before starting a read-only command', async () => {
    const strictRuntime = createComputerUseRuntime({ binaryPath: binaryPath(), storeRoot: join(directory, 'store') })
    await expect(strictRuntime.run({ argv: ['invoke', 'window.list'] })).rejects.toThrow(/attribution is required/)
    await strictRuntime.dispose()
  })

  it('rejects queued and future work after disposal', async () => {
    const pending = runtime.run({ argv: ['invoke', '--help'] })
    const rejected = expect(pending).rejects.toThrow('stopped')
    await runtime.dispose()
    await rejected
    await expect(runtime.run({ argv: ['invoke', '--help'] })).rejects.toThrow('stopped')
  })

  it.runIf(process.env.AIRI_COMPUTER_USE_LIVE === '1')('runs the bundled CLI through a private daemon and preserves failures', async () => {
    const help = await runtime.run({ argv: ['invoke', '--help'] })
    expect(help.exitCode).toBe(0)
    expect(help.output).toContain('window.list')
    const failure = await runtime.run({ argv: ['invoke', 'window.list', '--invalid-option'] })
    expect(failure.exitCode).not.toBe(0)
    expect(failure.stderr).toContain('invalid-option')
    const next = await runtime.run({ argv: ['invoke', '--help'] })
    expect(next.exitCode).toBe(0)
    // A read-only command must still succeed when the CLI reads the launcher token from stdin.
    const displays = await runtime.run({ argv: ['invoke', 'display.list'] })
    expect(displays.exitCode, displays.stderr).toBe(0)
    expect(displays.output).toEqual(expect.objectContaining({ command_id: 'display.list', status: 'completed' }))
  }, 30000)
})
