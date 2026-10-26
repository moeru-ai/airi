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
  let convertWebp: (data: Buffer, signal?: AbortSignal) => Promise<Buffer>
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'airi-cu-test-'))
    await mkdir(join(directory, 'store'))
    convertWebp = async () => {
      throw new Error('WebP conversion is not expected in this test.')
    }
    runtime = createComputerUseRuntime({ binaryPath: binaryPath(), storeRoot: join(directory, 'store'), webpToPng: (data, signal) => convertWebp(data, signal) })
  })
  afterEach(async () => {
    await runtime.dispose()
    await rm(directory, { recursive: true, force: true })
  })

  it('rejects shell commands, route overrides, and invalid input before starting AUV', async () => {
    await expect(runtime.run({ argv: ['serve', '--help'] })).rejects.toThrow('Use invoke')
    await expect(runtime.run({ argv: ['invoke', 'app.activate', '--device=other'] })).rejects.toThrow('managed by AIRI')
    await expect(runtime.run({ argv: ['invoke', 'window.list', '--store-root', 'elsewhere'] })).rejects.toThrow('managed by AIRI')
    await expect(runtime.run({ argv: ['invoke', 'window.list', '--credential-stdin'] })).rejects.toThrow('managed by AIRI')
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
    await expect(runtime.readImage({ path: text })).rejects.toThrow('PNG, JPEG, or WebP')
  })

  it('converts WebP screenshots to PNG before returning them', async () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8L'), Buffer.alloc(16)])
    const path = join(directory, 'store', 'capture.webp')
    await writeFile(path, webp)
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    const converted: Buffer[] = []
    convertWebp = async (data) => {
      converted.push(data)
      return png
    }
    expect(await runtime.readImage({ path })).toBe(`data:image/png;base64,${png.toString('base64')}`)
    expect(converted).toEqual([webp])
  })

  it('rejects a converted PNG that grows past the image limit', async () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8L'), Buffer.alloc(16)])
    const path = join(directory, 'store', 'large.webp')
    await writeFile(path, webp)
    convertWebp = async () => Buffer.alloc(8 * 1024 * 1024 + 1)
    await expect(runtime.readImage({ path })).rejects.toThrow('smaller than 8 MiB after converting')
  })

  it('aborts a pending conversion when the runtime is disposed', async () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8L'), Buffer.alloc(16)])
    const path = join(directory, 'store', 'pending.webp')
    await writeFile(path, webp)
    let started: (() => void) | undefined
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve
    })
    convertWebp = async (_data, signal) => {
      started?.()
      return await new Promise<Buffer>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('conversion aborted')), { once: true })
      })
    }
    const pending = runtime.readImage({ path })
    await startedPromise
    await runtime.dispose()
    await expect(pending).rejects.toThrow('conversion aborted')
  })

  it('keeps PNG and JPEG screenshots unchanged without converting them', async () => {
    const jpeg = Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70])
    const path = join(directory, 'store', 'capture.jpg')
    await writeFile(path, jpeg)
    expect(await runtime.readImage({ path })).toBe(`data:image/jpeg;base64,${jpeg.toString('base64')}`)
  })

  it('reports a WebP conversion failure instead of returning the WebP bytes', async () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8L'), Buffer.alloc(16)])
    const path = join(directory, 'store', 'broken.webp')
    await writeFile(path, webp)
    convertWebp = async () => {
      throw new Error('decoder unavailable')
    }
    await expect(runtime.readImage({ path })).rejects.toThrow('decoder unavailable')
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
