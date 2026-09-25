import process from 'node:process'

import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
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
    runtime = createComputerUseRuntime({ binaryPath: binaryPath(), storeRoot: join(directory, 'store') })
  })
  afterEach(async () => {
    await runtime.dispose()
    await rm(directory, { recursive: true, force: true })
  })

  it('rejects shell commands, route overrides, and invalid input before starting AUV', async () => {
    await expect(runtime.run({ argv: ['serve', '--help'] })).rejects.toThrow('Use invoke')
    await expect(runtime.run({ argv: ['invoke', 'app.activate', '--device=other'] })).rejects.toThrow('managed by AIRI')
    await expect(runtime.run({ argv: ['invoke', 'window.list', '--store-root', 'elsewhere'] })).rejects.toThrow('managed by AIRI')
    await expect(runtime.run({ argv: ['invoke', 'scan.frame'] })).rejects.toThrow('Use invoke')
    await expect(runtime.run({ argv: ['invoke', 5] })).rejects.toThrow()
  })

  it('reads screenshot bytes and rejects non-images and paths outside the artifact store', async () => {
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==', 'base64')
    const path = join(directory, 'store', 'capture.png')
    await writeFile(path, image)
    expect(await runtime.readImage({ path })).toBe(`data:image/png;base64,${image.toString('base64')}`)
    const outside = join(directory, 'outside.png')
    await writeFile(outside, image)
    await expect(runtime.readImage({ path: outside })).rejects.toThrow('Only screenshots')
    if (process.platform !== 'win32') {
      const link = join(directory, 'store', 'link.png')
      await symlink(outside, link)
      await expect(runtime.readImage({ path: link })).rejects.toThrow('Only screenshots')
    }
    const text = join(directory, 'store', 'text.png')
    await writeFile(text, 'not an image')
    await expect(runtime.readImage({ path: text })).rejects.toThrow('PNG or JPEG')
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
  }, 30000)
})
