import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import * as yaml from 'yaml'

import { collectInstallerFiles } from './collect-installer-files'

function sha512Of(text: string) {
  return createHash('sha512').update(text).digest('base64')
}

describe('collectInstallerFiles', () => {
  it('copies each feed and its installer files under the names of the feed, also after a rename', async () => {
    const root = await mkdtemp(join(tmpdir(), 'airi-collect-installer-files-'))
    const [dist, bundle, out] = ['dist', 'bundle', 'out'].map(name => join(root, name))
    await mkdir(dist)
    await mkdir(bundle)

    // The nightly steps move the zip to `bundle` under another name. The dmg is not an installer of the updater.
    await writeFile(join(bundle, 'AIRI-nightly-20261028-1bf946f-darwin-arm64.zip'), 'zip')
    await writeFile(join(dist, 'AIRI-0.13.1-nightly.45.1bf946f-darwin-arm64.dmg'), 'dmg')
    await writeFile(join(dist, 'latest-arm64-mac.yml'), yaml.stringify({
      version: '0.13.1-nightly.45.1bf946f',
      files: [
        { url: 'AIRI-0.13.1-nightly.45.1bf946f-arm64-mac.zip', sha512: sha512Of('zip'), size: 3 },
        { url: 'AIRI-0.13.1-nightly.45.1bf946f-darwin-arm64.dmg', sha512: sha512Of('dmg'), size: 3 },
      ],
    }))

    // The workflow writes the Windows feed of the signed installer to `bundle`, and it wins over the one in `dist`.
    await writeFile(join(bundle, 'AIRI-nightly-windows-x64-setup.exe'), 'signed')
    await writeFile(join(dist, 'latest-x64.yml'), yaml.stringify({ files: [{ url: 'unsigned.exe', sha512: sha512Of('unsigned'), size: 8 }] }))
    await writeFile(join(bundle, 'latest-x64.yml'), yaml.stringify({ files: [{ url: 'AIRI-nightly-windows-x64-setup.exe', sha512: sha512Of('signed'), size: 6 }] }))

    const copied = await collectInstallerFiles({ dirs: [bundle, dist], out })

    expect(copied.sort()).toEqual(['AIRI-0.13.1-nightly.45.1bf946f-arm64-mac.zip', 'AIRI-nightly-windows-x64-setup.exe'])
    expect((await readdir(out)).sort()).toEqual([
      'AIRI-0.13.1-nightly.45.1bf946f-arm64-mac.zip',
      'AIRI-nightly-windows-x64-setup.exe',
      'latest-arm64-mac.yml',
      'latest-x64.yml',
    ])
    expect(await readFile(join(out, 'AIRI-0.13.1-nightly.45.1bf946f-arm64-mac.zip'), 'utf8')).toBe('zip')
    expect(await readFile(join(out, 'latest-x64.yml'), 'utf8')).toContain('AIRI-nightly-windows-x64-setup.exe')
  })

  it('fails when a feed lists an installer that no file matches', async () => {
    const root = await mkdtemp(join(tmpdir(), 'airi-collect-installer-files-'))
    const dist = join(root, 'dist')
    await mkdir(dist)
    await writeFile(join(dist, 'latest-x64-linux.yml'), yaml.stringify({ files: [{ url: 'AIRI-linux-amd64.deb', sha512: sha512Of('deb'), size: 3 }] }))

    await expect(collectInstallerFiles({ dirs: [dist], out: join(root, 'out') })).rejects.toThrow('AIRI-linux-amd64.deb')
  })
})
