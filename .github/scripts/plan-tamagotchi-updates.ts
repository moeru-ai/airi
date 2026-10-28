import process from 'node:process'

import { appendFile, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

/** The feed of the ergosphere-it release store, as `feedUrl` of `apps/stage-tamagotchi/ergo.config.ts` names it. */
const FEED_URL = 'https://release-updates.airi.build'

/** The pages where people download a release by hand. */
const RELEASES_URL = 'https://github.com/moeru-ai/airi/releases'

/** What a channel of the release store serves now, and the version of each release that it names. */
export interface ServedChannel {
  /** The version of the bundle that the channel serves. Undefined when it serves no bundle. */
  bundleVersion?: string
  /** The version of the installer that the channel names. Undefined when it names no installer. */
  installerVersion?: string
}

export interface PlanInput {
  /** `github.event_name`. */
  event: string
  /** `github.event.action`, for example `published` or `released` of a `release` event. */
  action?: string
  /** `github.event.release.prerelease`: whether the release of a `release` event is a pre-release. */
  prerelease?: boolean
  /** The tag of a `release` event, or the `tag` input of a manual run. */
  tag?: string
  /** The `build_only` input of a manual run. */
  buildOnly?: boolean
  /** The `artifacts_only` input of a manual run. */
  artifactsOnly?: boolean
  /** The `version` of `apps/stage-tamagotchi/package.json`. */
  packageVersion: string
  runNumber: string
  sha: string
  /** Milliseconds since the epoch. The release IDs of ergosphere-it come from it. */
  now: number
  /** What `canary` serves now. Only a `released` event needs it. */
  canary?: ServedChannel
}

/** An installer release to name on channels, from the files that the run uploaded to its GitHub Release. */
export interface InstallerPlan {
  channels: string[]
  /** Where the electron-builder installer files of the release are. */
  filesUrl: string
  /** Where people download the release by hand. */
  downloadPage: string
}

export interface UpdatePlan {
  /** The ergosphere-it channel that the run publishes the bundle to. Undefined when the run publishes no bundle. */
  channel?: string
  /** The installer release that the run names on channels, after it published the bundle. */
  installer?: InstallerPlan
  /** The channel that a `released` event moves to `stable`, with its bundle and its installer. */
  promoteFrom?: string
  /** Why the run publishes nothing, for the job summary. */
  skipReason?: string
  /** The version that every build of the run writes into its bundle. */
  version: string
  /** The release ID of the bundle. Every build of the run shares it, so the installers ship the published bundle. */
  bundleReleaseId: number
  installerReleaseId: number
}

/**
 * Returns the version that a tag names: `0.13.0-rc.1` for `v0.13.0-rc.1`. Undefined when the tag is not a version.
 *
 * The Plan Updates job of `release-tamagotchi.yml` runs this script without an install, so it cannot import `semver`.
 * The pattern is the version grammar of semver.org, with an optional `v`.
 */
function versionOfTag(tag: string) {
  return /^v?((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9a-z-]+(?:\.[0-9a-z-]+)*)?(?:\+[0-9a-z-]+(?:\.[0-9a-z-]+)*)?)$/i.exec(tag)?.[1]
}

/**
 * Plans the over-the-air update of one run of `release-tamagotchi.yml`. AIRI has four channels:
 *
 * - `dev`: a push to main publishes its bundle. Its version names the build, for example `0.12.0+dev.45.1bf946f`.
 *   Semver ignores the part after `+`, so the about page does not take it for a downgrade.
 * - `nightly`: a scheduled run publishes its bundle, with a version such as `0.12.0+nightly.45.1bf946f`.
 * - `canary`: a release that is published as a GitHub pre-release publishes its bundle, and names its installers. This
 *   is every tag: `v0.13.0-rc.1`, `v0.13.0-beta.2`, and `v0.13.0` before it is stable. A manual release run with a tag
 *   does the same. The installers are also named on `dev`, so dev installs cross a change of the native version.
 * - `stable`: when the pre-release becomes a release, the run moves the bundle and the installer of `canary` to
 *   `stable`. It builds nothing, so stable installs get the bytes that canary installs tested. It stops when canary
 *   does not serve the version of the tag.
 *
 * `channelOfVersion` of `apps/stage-tamagotchi/src/shared/update-channels.ts` gives the same channel for a version, so
 * an install on auto follows the channel that gets its next release.
 *
 * Other manual runs publish nothing.
 */
export function planUpdates(input: PlanInput): UpdatePlan {
  const ids = { bundleReleaseId: input.now, installerReleaseId: input.now + 1 }
  const build = `${input.runNumber}.${input.sha.slice(0, 7)}`

  switch (input.event) {
    case 'push':
      return { ...ids, channel: 'dev', version: `${input.packageVersion}+dev.${build}` }
    case 'schedule':
      return { ...ids, channel: 'nightly', version: `${input.packageVersion}+nightly.${build}` }
  }

  const version = input.packageVersion
  // A pre-release reports `published`, also when it was a draft first. A release published directly also reports
  // `published`, and its `released` run checks canary.
  const releaseRun = (input.event === 'release' && ((input.action === 'published' && input.prerelease === true) || input.action === 'released'))
    || (input.event === 'workflow_dispatch' && !input.buildOnly && !input.artifactsOnly && !!input.tag)
  if (!releaseRun || !input.tag)
    return { ...ids, skipReason: 'This run is not a release.', version }

  const tagVersion = versionOfTag(input.tag)
  if (!tagVersion)
    return { ...ids, skipReason: `The tag ${input.tag} is not a version.`, version }

  if (input.action === 'released') {
    const served = input.canary
    if (served?.bundleVersion !== tagVersion)
      throw new Error(`Canary serves ${served?.bundleVersion ?? 'no bundle'}, not ${tagVersion}. Publish ${input.tag} as a pre-release first, and make it a release after its run published it to canary.`)
    if (served.installerVersion !== undefined && served.installerVersion !== tagVersion)
      throw new Error(`Canary names the installer ${served.installerVersion}, not ${tagVersion}. Run the release of ${input.tag} again before you promote it.`)

    return { ...ids, promoteFrom: 'canary', version: tagVersion }
  }

  return {
    ...ids,
    channel: 'canary',
    installer: {
      channels: ['canary', 'dev'],
      filesUrl: `${RELEASES_URL}/download/${input.tag}`,
      downloadPage: `${RELEASES_URL}/tag/${input.tag}`,
    },
    version,
  }
}

/** Reads a document of the release store. Returns undefined when the store does not have it. */
async function fetchFeedDocument<T>(path: string): Promise<T | undefined> {
  const response = await fetch(`${FEED_URL}/${path}`, { headers: { 'cache-control': 'no-cache' } })
  if (response.status === 404)
    return undefined
  if (!response.ok)
    throw new Error(`GET ${FEED_URL}/${path} returned ${response.status}.`)

  return await response.json() as T
}

/** Reads what a channel serves. The signatures do not matter here: the result only stops a wrong promotion. */
async function fetchServedChannel(channel: string): Promise<ServedChannel> {
  const file = await fetchFeedDocument<{ bundle?: { releaseId: number }, installer?: { releaseId: number } }>(`channels/${channel}.json`)
  const bundle = file?.bundle && await fetchFeedDocument<{ version: string }>(`bundles/${file.bundle.releaseId}/bundle.json`)
  const installer = file?.installer && await fetchFeedDocument<{ version: string }>(`installers/${file.installer.releaseId}/installer.json`)

  return { bundleVersion: bundle?.version, installerVersion: installer?.version }
}

async function main() {
  const { env } = process
  const packageJson = JSON.parse(await readFile('apps/stage-tamagotchi/package.json', 'utf8')) as { version: string }
  const plan = planUpdates({
    event: env.EVENT ?? '',
    action: env.ACTION || undefined,
    prerelease: env.PRERELEASE === 'true',
    tag: env.TAG || undefined,
    buildOnly: env.BUILD_ONLY === 'true',
    artifactsOnly: env.ARTIFACTS_ONLY === 'true',
    packageVersion: packageJson.version,
    runNumber: env.GITHUB_RUN_NUMBER ?? '0',
    sha: env.GITHUB_SHA ?? '',
    now: Date.now(),
    canary: env.ACTION === 'released' ? await fetchServedChannel('canary') : undefined,
  })

  if (env.GITHUB_OUTPUT) {
    await appendFile(env.GITHUB_OUTPUT, [
      `channel=${plan.channel ?? ''}`,
      `version=${plan.version}`,
      `bundle-release-id=${plan.bundleReleaseId}`,
      `installer-release-id=${plan.installerReleaseId}`,
      `installer-channels=${plan.installer?.channels.join(' ') ?? ''}`,
      `installer-files-url=${plan.installer?.filesUrl ?? ''}`,
      `installer-download-page=${plan.installer?.downloadPage ?? ''}`,
      `promote-from=${plan.promoteFrom ?? ''}`,
      '',
    ].join('\n'))
  }

  const summary = plan.promoteFrom
    ? `Moves ${plan.version} from ${plan.promoteFrom} to stable.`
    : plan.channel
      ? `Publishes ${plan.version} to the ${plan.channel} channel, release ID ${plan.bundleReleaseId}.${plan.installer ? ` Names its installers on ${plan.installer.channels.join(' and ')}.` : ''}`
      : `Publishes no bundle. ${plan.skipReason}`
  // GitHub Actions reads annotation commands from standard output.
  process.stdout.write(`::notice title=Update plan::${summary}\n`)
  if (env.GITHUB_STEP_SUMMARY)
    await appendFile(env.GITHUB_STEP_SUMMARY, `${summary}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
