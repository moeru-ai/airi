import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createOutputManifest, diffOutputManifests } from './check-reproducible-build'

const roots: string[] = []

async function createOutput(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'airi-reproducible-build-test-'))
  for (const [file, content] of Object.entries(files)) {
    await mkdir(join(root, file, '..'), { recursive: true })
    await writeFile(join(root, file), content)
  }

  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('createOutputManifest', () => {
  it('hashes nested files under slash-separated relative paths in sorted order', async () => {
    const root = await createOutput({
      'renderer/assets/index-abc.js': 'renderer',
      'main/index.js': 'main',
      'preload/index.mjs': 'preload',
    })

    const manifest = await createOutputManifest(root)

    expect([...manifest.keys()]).toEqual(['main/index.js', 'preload/index.mjs', 'renderer/assets/index-abc.js'])
    expect(manifest.get('main/index.js')).toBe('0d6e4079e36703ebd37c00722f5891d28b0e2811dc114b129215123adcce3605')
  })
})

describe('diffOutputManifests', () => {
  it('reports no difference for two outputs with the same bytes', async () => {
    const files = { 'main/index.js': 'main', 'renderer/index.html': '<html>' }
    const first = await createOutputManifest(await createOutput(files))
    const second = await createOutputManifest(await createOutput(files))

    expect(diffOutputManifests(first, second)).toEqual({ changed: [], removed: [], added: [] })
  })

  it('reports changed, removed, and added files', async () => {
    const first = await createOutputManifest(await createOutput({
      'main/index.js': 'const time = new Date(1)',
      'renderer/assets/settings-AAAA.js': 'settings',
      'preload/index.mjs': 'preload',
    }))
    const second = await createOutputManifest(await createOutput({
      'main/index.js': 'const time = new Date(2)',
      'renderer/assets/settings-BBBB.js': 'settings',
      'preload/index.mjs': 'preload',
    }))

    const diff = diffOutputManifests(first, second)

    expect(diff.changed).toEqual(['main/index.js'])
    expect(diff.removed).toEqual(['renderer/assets/settings-AAAA.js'])
    expect(diff.added).toEqual(['renderer/assets/settings-BBBB.js'])
  })
})
