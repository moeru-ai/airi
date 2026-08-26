import process from 'node:process'

import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import * as yaml from 'yaml'

import { hashFile, regenerateWindowsLatest } from './regenerate-windows-latest'

describe('regenerateWindowsLatest', () => {
  let originalCwd: string

  beforeEach(() => {
    originalCwd = process.cwd()
  })

  afterEach(() => {
    process.chdir(originalCwd)
  })

  it('resolves workspace-root-relative paths from the package cwd and rewrites latest.yml from the signed installer', async () => {
    const root = await mkdtemp(join(tmpdir(), 'airi-regenerate-windows-latest-'))
    const workspaceRoot = join(root, 'repo')
    const packageDir = join(workspaceRoot, 'apps', 'stage-tamagotchi')
    const bundleDir = join(packageDir, 'bundle')

    await mkdir(bundleDir, { recursive: true })
    await writeFile(join(workspaceRoot, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n', 'utf8')
    await writeFile(join(bundleDir, 'AIRI-1.2.3-windows-x64-setup.exe'), 'signed-binary-content', 'utf8')
    await writeFile(join(bundleDir, 'latest.yml'), yaml.stringify({
      version: 'stale-version',
      path: 'stale.exe',
      sha512: 'stale-sha512',
      releaseDate: '2026-01-02T03:04:05.000Z',
      stagingPercentage: 25,
      files: [{ url: 'stale.exe', sha512: 'stale-sha512', size: 10 }],
    }), 'utf8')

    process.chdir(packageDir)

    const nextUpdateInfo = await regenerateWindowsLatest({
      input: 'apps/stage-tamagotchi/bundle/AIRI-1.2.3-windows-x64-setup.exe',
      output: 'apps/stage-tamagotchi/bundle/latest.yml',
      version: '1.2.3',
    })

    const expectedHashes = await hashFile(join(bundleDir, 'AIRI-1.2.3-windows-x64-setup.exe'))
    expect(nextUpdateInfo).toMatchObject({
      version: '1.2.3',
      path: 'AIRI-1.2.3-windows-x64-setup.exe',
      sha512: expectedHashes.sha512,
      sha2: expectedHashes.sha256,
      releaseDate: '2026-01-02T03:04:05.000Z',
      stagingPercentage: 25,
      files: [
        {
          url: 'AIRI-1.2.3-windows-x64-setup.exe',
          sha512: expectedHashes.sha512,
        },
      ],
    })
    expect(nextUpdateInfo.files[0]?.size).toBe(Buffer.byteLength('signed-binary-content'))

    const persisted = yaml.parse(await readFile(join(bundleDir, 'latest.yml'), 'utf8'))
    expect(persisted).toMatchObject(nextUpdateInfo)
  })

  it('also works with package-relative paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'airi-regenerate-windows-latest-'))
    const packageDir = join(root, 'apps', 'stage-tamagotchi')
    const bundleDir = join(packageDir, 'bundle')

    await mkdir(bundleDir, { recursive: true })
    await writeFile(join(bundleDir, 'AIRI-9.9.9-windows-x64-setup.exe'), 'another-signed-binary', 'utf8')
    process.chdir(packageDir)

    await regenerateWindowsLatest({
      input: 'bundle/AIRI-9.9.9-windows-x64-setup.exe',
      output: 'bundle/latest.yml',
      version: '9.9.9',
      releaseDate: '2026-03-23T00:00:00.000Z',
    })

    const persisted = yaml.parse(await readFile(resolve(bundleDir, 'latest.yml'), 'utf8'))
    const expectedHashes = await hashFile(join(bundleDir, 'AIRI-9.9.9-windows-x64-setup.exe'))
    expect(persisted).toMatchObject({
      version: '9.9.9',
      path: 'AIRI-9.9.9-windows-x64-setup.exe',
      sha512: expectedHashes.sha512,
      sha2: expectedHashes.sha256,
      releaseDate: '2026-03-23T00:00:00.000Z',
      files: [
        {
          url: 'AIRI-9.9.9-windows-x64-setup.exe',
          sha512: expectedHashes.sha512,
        },
      ],
    })
  })
})
