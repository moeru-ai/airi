import process from 'node:process'

import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { binaryPath } from '@auv-js/cli/binary'
import { Transformer } from '@napi-rs/image'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createComputerUseRuntime } from './runtime'

describe('computer use runtime', () => {
  let directory: string
  let runtime: ReturnType<typeof createComputerUseRuntime>
  const webp = Buffer.from('UklGRh4AAABXRUJQVlA4TBEAAAAvAQAAAA+w//Mf8x8VMqL/AQA=', 'base64')
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'airi-cu-test-'))
    await mkdir(join(directory, 'store'))
    runtime = createComputerUseRuntime({ binaryPath: binaryPath(), storeRoot: join(directory, 'store') })
  })
  afterEach(async () => {
    await runtime.dispose()
    await rm(directory, { recursive: true, force: true })
    vi.restoreAllMocks()
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

  // https://github.com/moeru-ai/airi/issues/3120
  // ROOT CAUSE:
  // AUV writes WebP screenshots on Windows, but readImage accepted only PNG and JPEG.
  // Decode WebP to PNG with the native image library before returning model image content.
  it('converts a real WebP screenshot to PNG without changing its pixels (Issue #3120)', async () => {
    const path = join(directory, 'store', 'capture.webp')
    await writeFile(path, webp)
    const result = await runtime.readImage({ path })
    expect(result).toMatch(/^data:image\/png;base64,/)
    const png = Buffer.from(result.slice('data:image/png;base64,'.length), 'base64')
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    expect(png.readUInt32BE(16)).toBe(2)
    expect(png.readUInt32BE(20)).toBe(1)
    expect(await new Transformer(png).rawPixels()).toEqual(Buffer.from([255, 0, 0, 0, 255, 0]))
  })

  it('rejects a converted PNG that grows past the image limit', async () => {
    const path = join(directory, 'store', 'large.webp')
    await writeFile(path, webp)
    vi.spyOn(Transformer.prototype, 'png').mockResolvedValue(Buffer.alloc(8 * 1024 * 1024 + 1))
    await expect(runtime.readImage({ path })).rejects.toThrow('smaller than 8 MiB after converting')
  })

  it('gives the native conversion the runtime abort signal, so disposal cancels it', async () => {
    const path = join(directory, 'store', 'pending.webp')
    await writeFile(path, webp)
    let started: (() => void) | undefined
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve
    })
    vi.spyOn(Transformer.prototype, 'png').mockImplementation((_options, signal) => {
      started?.()
      return new Promise<Buffer>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('conversion aborted')), { once: true })
      })
    })
    const pending = runtime.readImage({ path })
    const rejected = expect(pending).rejects.toThrow('conversion aborted')
    await startedPromise
    await runtime.dispose()
    await rejected
  })

  it('keeps PNG and JPEG screenshots unchanged without converting them', async () => {
    const jpeg = Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70])
    const path = join(directory, 'store', 'capture.jpg')
    await writeFile(path, jpeg)
    const convert = vi.spyOn(Transformer.prototype, 'png')
    expect(await runtime.readImage({ path })).toBe(`data:image/jpeg;base64,${jpeg.toString('base64')}`)
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SAAAAABJRU5ErkJggg==', 'base64')
    const pngPath = join(directory, 'store', 'capture.png')
    await writeFile(pngPath, png)
    expect(await runtime.readImage({ path: pngPath })).toBe(`data:image/png;base64,${png.toString('base64')}`)
    expect(convert).not.toHaveBeenCalled()
  })

  it('reports a WebP conversion failure instead of returning the WebP bytes', async () => {
    const path = join(directory, 'store', 'broken.webp')
    await writeFile(path, webp.subarray(0, 16))
    await expect(runtime.readImage({ path })).rejects.toThrow()
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
