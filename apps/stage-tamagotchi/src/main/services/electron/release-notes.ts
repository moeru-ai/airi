import semver from 'semver'

import { net } from 'electron'
import { nullish, object, safeParse, string } from 'valibot'

import { channelOfVersion } from '../../../shared/update-channels'

const repositoryUrl = 'https://github.com/moeru-ai/airi'
const releaseApiUrl = 'https://api.github.com/repos/moeru-ai/airi/releases/tags'

const releaseSchema = object({
  body: nullish(string()),
})

/**
 * Returns whether `version` has a GitHub release. Releases and prereleases have a tag `v<version>`. A `dev` or
 * `nightly` build has none.
 */
export function hasGitHubRelease(version: string) {
  const channel = channelOfVersion(version)
  return channel !== 'dev' && channel !== 'nightly'
}

/**
 * Returns the git ref of a build: its tag, or the commit at the end of a `dev` or `nightly` version.
 *
 * @example
 * gitRefOfVersion('0.15.0') // 'v0.15.0'
 * gitRefOfVersion('0.13.1-dev.821.13eef81') // '13eef81'
 */
export function gitRefOfVersion(version: string) {
  if (hasGitHubRelease(version))
    return `v${version}`

  const commit = semver.parse(version)?.prerelease.at(-1)
  return typeof commit === 'string' ? commit : undefined
}

/**
 * Returns the GitHub page that lists the changes from `currentVersion` to `targetVersion`.
 *
 * A target with a release gets its release page. A `dev` or `nightly` target gets the compare page of the two
 * commits, because it has no release.
 */
export function changesUrlOf(currentVersion: string, targetVersion: string) {
  if (hasGitHubRelease(targetVersion))
    return `${repositoryUrl}/releases/tag/v${targetVersion}`

  const from = gitRefOfVersion(currentVersion)
  const to = gitRefOfVersion(targetVersion)
  if (!from || !to)
    return undefined

  return `${repositoryUrl}/compare/${from}...${to}`
}

/**
 * Reads the Markdown notes of the GitHub release of `version`.
 *
 * Returns `undefined` when the release has no notes. Throws when the request fails, for example without network or
 * when GitHub has no release with this tag.
 */
export async function fetchGitHubReleaseNotes(version: string) {
  const response = await net.fetch(`${releaseApiUrl}/v${encodeURIComponent(version)}`, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok)
    throw new Error(`GitHub returned ${response.status} for the release v${version}.`)

  const release = safeParse(releaseSchema, await response.json())
  if (!release.success)
    throw new Error(`GitHub returned an unexpected release v${version}.`)

  return release.output.body?.trim() || undefined
}
