import semver from 'semver'

/** Returns true when the input is a canonical semantic version, not a range or prefixed version. */
export function isExactSemanticVersion(version: string): boolean {
  const parsed = semver.parse(version)
  if (!parsed) {
    return false
  }

  // SemVer.version omits build metadata. Restore it before checking canonical spelling.
  const build = parsed.build.length > 0 ? `+${parsed.build.join('.')}` : ''
  return `${parsed.version}${build}` === version
}
