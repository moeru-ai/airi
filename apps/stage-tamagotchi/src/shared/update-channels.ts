import semver from 'semver'

/**
 * The update channels of the ergosphere-it release store, as `.github/scripts/plan-tamagotchi-updates.ts` publishes
 * them.
 *
 * - `stable`: releases.
 * - `canary`: prereleases, before they become releases.
 * - `nightly`: the build of each day.
 * - `dev`: the build of each push to main.
 */
export const updateChannels = ['stable', 'canary', 'nightly', 'dev'] as const

export type UpdateChannel = typeof updateChannels[number]

/**
 * Returns the channel that a version comes from. With no channel that the user chose, the app follows this channel, and
 * `ergo.config.ts` builds it in.
 *
 * Build metadata names a build of main, and a prerelease names a release candidate.
 *
 * @example
 * channelOfVersion('0.13.0+dev.821.13eef81') // 'dev'
 * channelOfVersion('0.13.0+nightly.12.13eef81') // 'nightly'
 * channelOfVersion('0.14.0-rc.1') // 'canary'
 * channelOfVersion('0.13.0') // 'stable'
 */
export function channelOfVersion(version: string): UpdateChannel {
  const parsed = semver.parse(version)
  const build = parsed?.build[0]?.toLowerCase()
  if (build === 'dev' || build === 'nightly')
    return build
  if (parsed && parsed.prerelease.length > 0)
    return 'canary'

  return 'stable'
}
