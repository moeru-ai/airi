import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveUserDataPath } from './userData'

describe('resolveUserDataPath', () => {
  it('keeps the Electron default for direct builds', () => {
    expect(resolveUserDataPath({
      defaultPath: join('app-data', 'AIRI'),
      distribution: 'direct',
    })).toBeUndefined()
  })

  it('prefers an explicit operational override', () => {
    expect(resolveUserDataPath({
      defaultPath: join('app-data', 'AIRI'),
      distribution: 'steam',
      overridePath: `  ${join('test-data', 'airi')}  `,
    })).toBe(join('test-data', 'airi'))
  })

  // https://github.com/moeru-ai/airi/pull/1966#discussion_r3432862899
  it('isolates Steam user data from direct installations for PR #1966', () => {
    // ROOT CAUSE:
    //
    // Steam and direct builds both accepted Electron's default userData path,
    // so a Steam launch could restore credentials and local state written by a
    // direct installation before startup Steam authentication ran.
    //
    // Before the fix, this returned undefined and kept the shared default.
    //
    // We fixed this by deriving a Steam-only sibling directory while keeping
    // the explicit APP_USER_DATA_PATH override authoritative.
    expect(resolveUserDataPath({
      defaultPath: join('app-data', 'AIRI'),
      distribution: 'steam',
    })).toBe(join('app-data', 'AIRI-steam'))
  })
})
