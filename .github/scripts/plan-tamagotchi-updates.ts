import process from 'node:process'

import { appendFile, readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

/** The update channels that a release tag can name with its prerelease, as `ergo.config.ts` derives them. */
const PRERELEASE_CHANNELS = ['alpha', 'beta', 'nightly', 'canary'] as const

export interface PlanInput {
  /** `github.event_name`. */
  event: string
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
}

export interface UpdatePlan {
  /** The ergosphere-it channel that the run publishes the bundle to. Undefined when the run publishes nothing. */
  channel?: string
  /** Why the run publishes nothing, for the job summary. */
  skipReason?: string
  /** The version that every build of the run writes into its bundle. */
  version: string
  /** The release ID of the bundle. Every build of the run shares it, so the installers ship the published bundle. */
  bundleReleaseId: number
  installerReleaseId: number
}

/**
 * Plans the over-the-air update of one run of `release-tamagotchi.yml`.
 *
 * - A push to main publishes to `dev`, and a scheduled run to `nightly`. Their versions name the build, for example
 *   `0.12.0+dev.45.1bf946f`. Semver ignores the part after `+`, so the about page does not take them for a downgrade.
 * - A release, or a manual release run with a tag, publishes to the lane of the tag: `v0.13.0-beta.1` to `beta`, and
 *   `v0.13.0` to `stable`. A prerelease of another name, for example `v0.13.0-rc.1`, publishes nothing, so it never
 *   reaches stable.
 * - Other manual runs publish nothing.
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
  const releaseRun = input.event === 'release'
    || (input.event === 'workflow_dispatch' && !input.buildOnly && !input.artifactsOnly && !!input.tag)
  if (!releaseRun || !input.tag)
    return { ...ids, skipReason: 'This run is not a release.', version }

  // A semver tag with an optional `v`: `v0.13.0`, `v0.13.0-beta.1`, or `v0.13.0+build.1`.
  const match = /^v?\d+\.\d+\.\d+(?:-([0-9a-z.-]+))?(?:\+[0-9a-z.-]+)?$/i.exec(input.tag)
  if (!match)
    return { ...ids, skipReason: `The tag ${input.tag} is not a version.`, version }
  if (match[1] === undefined)
    return { ...ids, channel: 'stable', version }

  // The name of the prerelease: `beta` of `beta.1`, and of `beta1`.
  const prerelease = /^[a-z]+/i.exec(match[1])?.[0].toLowerCase()
  if (prerelease !== undefined && (PRERELEASE_CHANNELS as readonly string[]).includes(prerelease))
    return { ...ids, channel: prerelease, version }

  return { ...ids, skipReason: `The tag ${input.tag} names no update channel.`, version }
}

async function main() {
  const { env } = process
  const packageJson = JSON.parse(await readFile('apps/stage-tamagotchi/package.json', 'utf8')) as { version: string }
  const plan = planUpdates({
    event: env.EVENT ?? '',
    tag: env.TAG || undefined,
    buildOnly: env.BUILD_ONLY === 'true',
    artifactsOnly: env.ARTIFACTS_ONLY === 'true',
    packageVersion: packageJson.version,
    runNumber: env.GITHUB_RUN_NUMBER ?? '0',
    sha: env.GITHUB_SHA ?? '',
    now: Date.now(),
  })

  if (env.GITHUB_OUTPUT) {
    await appendFile(env.GITHUB_OUTPUT, [
      `channel=${plan.channel ?? ''}`,
      `version=${plan.version}`,
      `bundle-release-id=${plan.bundleReleaseId}`,
      `installer-release-id=${plan.installerReleaseId}`,
      '',
    ].join('\n'))
  }

  const summary = plan.channel
    ? `Publishes ${plan.version} to the ${plan.channel} channel, release ID ${plan.bundleReleaseId}.`
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
