import { describe, expect, it } from 'vitest'

import { isExactSemanticVersion } from './exact-semantic-version'

describe('exact semantic versions', () => {
  // https://github.com/moeru-ai/airi/pull/2687
  it('accepts canonical versions with prerelease and build metadata (PR #2687)', () => {
    // ROOT CAUSE:
    //
    // semver.valid returns a version without build metadata.
    // The old equality check rejected valid versions with a build suffix.
    // The predicate now compares the input with the parsed version and its build identifiers.
    for (const version of ['1.2.3', '1.2.3-rc.1', '1.2.3+build.7', '1.2.3-rc.1+build.007']) {
      expect(isExactSemanticVersion(version), version).toBe(true)
    }
  })

  it('rejects ranges, prefixes, whitespace and malformed identifiers', () => {
    for (const version of ['', '^1.2.3', '1.x', 'v1.2.3', '=1.2.3', ' 1.2.3', '1.2.3 ', 'v1.2.3+build.7', '1.2.3+build.7 ', '01.2.3', '1.2.3-01', '1.2.3+', '1.2.3+a..b']) {
      expect(isExactSemanticVersion(version), version).toBe(false)
    }
  })
})
