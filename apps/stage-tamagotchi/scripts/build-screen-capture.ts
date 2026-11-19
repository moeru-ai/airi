import process from 'node:process'

import { execFile } from 'node:child_process'
import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

/**
 * Builds the macOS capture helper as a universal binary for development and
 * packaging. Sources are checked by timestamp, so ordinary Vite reloads reuse
 * the binary. Release users need no compiler or Xcode installation.
 *
 * Call stack:
 *
 * electron.vite.config
 *   -> buildScreenCapture
 *     -> swiftc (arm64, x86_64)
 *     -> lipo (universal executable)
 */
export async function buildScreenCapture(root: string) {
  if (process.platform !== 'darwin')
    return
  const source = join(root, 'native', 'screen-capture.swift')
  const directory = join(root, 'out', 'native')
  const binary = join(directory, 'screen-capture')
  const existing = await stat(binary).catch((error) => {
    if (error.code !== 'ENOENT')
      throw error
    return undefined
  })
  if (existing && existing.mtimeMs > (await stat(source)).mtimeMs && existing.mtimeMs > (await stat(join(root, 'scripts', 'build-screen-capture.ts'))).mtimeMs)
    return
  await mkdir(directory, { recursive: true })
  const slices = []
  for (const arch of ['arm64', 'x86_64']) {
    const slice = join(directory, `screen-capture-${arch}`)
    await run('xcrun', ['swiftc', '-O', '-target', `${arch}-apple-macos13.0`, source, '-o', slice])
    slices.push(slice)
  }
  await run('xcrun', ['lipo', '-create', ...slices, '-output', binary])
  await run('codesign', ['--force', '--sign', '-', binary])
}
