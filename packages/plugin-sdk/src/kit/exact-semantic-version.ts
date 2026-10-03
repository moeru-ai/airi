import semver from 'semver'

/** Returns true when the input is a canonical semantic version, not a range or prefixed version. */
export function isExactSemanticVersion(version: string): boolean {
  return semver.valid(version) === version
}
