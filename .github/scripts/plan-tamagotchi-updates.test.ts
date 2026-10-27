import { describe, expect, it } from 'vitest'

import { planUpdates } from './plan-tamagotchi-updates'

const base = { packageVersion: '0.13.0', runNumber: '45', sha: '1bf946fde4e2c3a0', now: 1793009352488 }

describe('planUpdates', () => {
  it('publishes each push to main to dev, with a version that names the build', () => {
    expect(planUpdates({ ...base, event: 'push' })).toEqual({
      bundleReleaseId: 1793009352488,
      channel: 'dev',
      installerReleaseId: 1793009352489,
      version: '0.13.0+dev.45.1bf946f',
    })
  })

  it('publishes a scheduled run to nightly', () => {
    expect(planUpdates({ ...base, event: 'schedule' })).toMatchObject({ channel: 'nightly', version: '0.13.0+nightly.45.1bf946f' })
  })

  it.each([
    { tag: 'v0.13.0', channel: 'stable' },
    { tag: '0.13.0', channel: 'stable' },
    { tag: 'v0.13.0+build.7', channel: 'stable' },
    { tag: 'v0.13.0-beta.1', channel: 'beta' },
    { tag: 'v0.13.0-alpha.36', channel: 'alpha' },
    { tag: 'v0.13.0-Nightly.20261026', channel: 'nightly' },
    { tag: 'v0.13.0-canary1', channel: 'canary' },
  ])('publishes the release $tag to $channel with the version of package.json', ({ tag, channel }) => {
    expect(planUpdates({ ...base, event: 'release', tag })).toEqual({ ...planUpdates({ ...base, event: 'push' }), channel, version: '0.13.0' })
  })

  // A prerelease that names no channel must never fall back to stable, or stable installs would take it.
  it.each(['v0.13.0-rc.1', 'v0.13.0-1', 'v0.13.0.1', 'release-2026', 'v0.13'])('publishes nothing for the tag %s', (tag) => {
    const plan = planUpdates({ ...base, event: 'release', tag })

    expect(plan.channel).toBeUndefined()
    expect(plan.skipReason).toContain(tag)
  })

  it('publishes a manual release run with a tag, and nothing for other manual runs', () => {
    expect(planUpdates({ ...base, event: 'workflow_dispatch', tag: 'v0.13.0-beta.2' }).channel).toBe('beta')
    expect(planUpdates({ ...base, event: 'workflow_dispatch' })).toMatchObject({ skipReason: 'This run is not a release.' })
    expect(planUpdates({ ...base, event: 'workflow_dispatch' }).channel).toBeUndefined()
    expect(planUpdates({ ...base, event: 'workflow_dispatch', tag: 'v0.13.0', buildOnly: true }).channel).toBeUndefined()
    expect(planUpdates({ ...base, event: 'workflow_dispatch', tag: 'v0.13.0', artifactsOnly: true }).channel).toBeUndefined()
  })
})
