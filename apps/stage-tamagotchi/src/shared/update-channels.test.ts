import { describe, expect, it } from 'vitest'

import { channelOfVersion } from './update-channels'

describe('channelOfVersion', () => {
  it.each([
    { version: '0.13.1-dev.821.13eef81', expected: 'dev' },
    { version: '0.13.1-nightly.12.13eef81', expected: 'nightly' },
    { version: '0.13.0+dev.821.13eef81', expected: 'stable' },
    { version: '0.14.0-rc.1', expected: 'canary' },
    { version: '0.14.0-beta.2', expected: 'canary' },
    { version: 'v0.14.0-alpha.1', expected: 'canary' },
    { version: '0.13.0', expected: 'stable' },
    { version: '0.13.0+build.7', expected: 'stable' },
  ])('maps $version to $expected', ({ version, expected }) => {
    expect(channelOfVersion(version)).toBe(expected)
  })
})
