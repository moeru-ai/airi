import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import * as yaml from 'yaml'

import { generateManifestFixtures, resolveLatestFilenameForTarget } from './generate-manifest'

describe('generateManifestFixtures', () => {
  const roots: string[] = []

  afterEach(async () => {
    await Promise.all(roots.map(async (root) => {
      await import('node:fs/promises').then(({ rm }) => rm(root, { recursive: true, force: true }))
    }))
    roots.length = 0
  })

  it('maps targets to the expected latest-yml filenames', () => {
    expect(resolveLatestFilenameForTarget('x86_64-pc-windows-msvc')).toBe('latest-x64.yml')
    expect(resolveLatestFilenameForTarget('aarch64-apple-darwin')).toBe('latest-arm64-mac.yml')
    expect(resolveLatestFilenameForTarget('x86_64-apple-darwin')).toBe('latest-x64-mac.yml')
    expect(resolveLatestFilenameForTarget('x86_64-unknown-linux-gnu')).toBe('latest-x64-linux.yml')
    expect(resolveLatestFilenameForTarget('aarch64-unknown-linux-gnu')).toBe('latest-arm64-linux-arm64.yml')
  })

  it('generates a channel directory, manifest, and placeholder artifact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'airi-update-test-'))
    roots.push(root)

    const result = await generateManifestFixtures({
      rootDir: root,
      channel: 'stable',
      target: 'x86_64-pc-windows-msvc',
      version: '9.9.9-test.1',
      releaseNotes: 'Mock update for AIRI local updater verification.',
      artifactContent: 'mock-installer-binary',
    })

    expect(result.channelDir).toBe(join(root, 'stable'))
    expect(result.latestFilename).toBe('latest-x64.yml')
    expect(result.artifactFilename).toBe('AIRI-9.9.9-test.1-windows-x64-setup.exe')

    const manifest = yaml.parse(await readFile(result.manifestPath, 'utf8'))
    expect(manifest).toMatchObject({
      version: '9.9.9-test.1',
      path: 'AIRI-9.9.9-test.1-windows-x64-setup.exe',
      releaseNotes: 'Mock update for AIRI local updater verification.',
      files: [
        {
          url: 'AIRI-9.9.9-test.1-windows-x64-setup.exe',
        },
      ],
    })

    expect(typeof manifest.sha512).toBe('string')
    expect(typeof manifest.releaseDate).toBe('string')
    expect(manifest.files[0]?.size).toBeGreaterThan(0)
    await expect(readFile(result.artifactPath, 'utf8')).resolves.toBe('mock-installer-binary')
  })
})
