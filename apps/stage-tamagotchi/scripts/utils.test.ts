import { describe, expect, it } from 'vitest'

import packageJSON from '../package.json' with { type: 'json' }

import { getFilenames } from './utils'

const release = { release: true, autoTag: false, tag: ['v0.13.1'] }

describe('getFilenames', () => {
  // electron-builder names the architecture differently for each package format.
  // See `getArtifactArchName` in `builder-util/out/arch.js`.
  it.each([
    {
      target: 'x86_64-unknown-linux-gnu',
      expected: {
        'deb': 'AIRI-0.13.1-linux-amd64.deb',
        'rpm': 'AIRI-0.13.1-linux-x86_64.rpm',
        'pacman': 'AIRI-0.13.1-linux-x64.pacman',
        'AppImage': 'AIRI-0.13.1-linux-x86_64.AppImage',
        'flatpak': 'AIRI-0.13.1-linux-x64.flatpak',
        'latest-x64-linux.yml': 'latest-x64-linux.yml',
      },
    },
    {
      target: 'aarch64-unknown-linux-gnu',
      expected: {
        'deb': 'AIRI-0.13.1-linux-arm64.deb',
        'rpm': 'AIRI-0.13.1-linux-aarch64.rpm',
        'pacman': 'AIRI-0.13.1-linux-aarch64.pacman',
        'AppImage': 'AIRI-0.13.1-linux-arm64.AppImage',
        'flatpak': 'AIRI-0.13.1-linux-arm64.flatpak',
        'latest-arm64-linux-arm64.yml': 'latest-arm64-linux-arm64.yml',
      },
    },
  ])('names each Linux package of $target as electron-builder does', async ({ target, expected }) => {
    const filenames = await getFilenames(target, release)

    expect(Object.fromEntries(filenames.map(filename => [filename.extension, filename.releaseArtifactFilename]))).toEqual(expected)
  })

  it('finds each Linux build output under the version of package.json', async () => {
    const filenames = await getFilenames('x86_64-unknown-linux-gnu', release)

    expect(filenames.find(filename => filename.extension === 'AppImage')?.outputFilename)
      .toBe(`AIRI-${packageJSON.version}-linux-x86_64.AppImage`)
  })

  it('marks only the update feed as optional', async () => {
    const filenames = await getFilenames('x86_64-unknown-linux-gnu', release)

    expect(filenames.filter(filename => filename.optional).map(filename => filename.extension)).toEqual(['latest-x64-linux.yml'])
  })
})
