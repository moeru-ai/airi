import { describe, expect, it } from 'vitest'

import { planUpdates } from './plan-tamagotchi-updates'

const base = { packageVersion: '0.13.0', runNumber: '45', sha: '1bf946fde4e2c3a0', now: 1793009352488 }

describe('planUpdates', () => {
  const dev = { bundleNativeVersion: { min: 2, max: 2 }, bundleVersion: '0.13.1-dev.44.0aa1111' }

  it('publishes each push to main to dev, as a prerelease of the next version that names the build', () => {
    expect(planUpdates({ ...base, event: 'push', nativeVersion: 2, dev })).toEqual({
      buildInstallers: false,
      bundleReleaseId: 1793009352488,
      channel: 'dev',
      installerReleaseId: 1793009352489,
      version: '0.13.1-dev.45.1bf946f',
    })
  })

  // Dev installs cannot run a bundle for another native version, so they need an installer of the push.
  it.each([
    { name: 'a newer native version', served: dev, nativeVersion: 3 },
    { name: 'no bundle on dev', served: {}, nativeVersion: 2 },
  ])('builds installers of a push for $name, and names them on dev from the release store', ({ served, nativeVersion }) => {
    expect(planUpdates({ ...base, event: 'push', nativeVersion, dev: served })).toMatchObject({
      buildInstallers: true,
      channel: 'dev',
      installer: { channels: ['dev'], downloadPage: 'https://github.com/moeru-ai/airi/releases' },
      version: '0.13.1-dev.45.1bf946f',
    })
  })

  it('publishes a scheduled run to nightly, and names its installers on nightly from the release store', () => {
    const plan = planUpdates({ ...base, event: 'schedule' })

    expect(plan).toMatchObject({
      buildInstallers: true,
      channel: 'nightly',
      installer: { channels: ['nightly'], downloadPage: 'https://github.com/moeru-ai/airi/releases' },
      version: '0.13.1-nightly.45.1bf946f',
    })
    expect(plan.installer?.filesUrl).toBeUndefined()
  })

  it.each(['v0.13.0', '0.13.0', 'v0.13.0+build.7', 'v0.13.0-beta.1', 'v0.13.0-alpha.36', 'v0.13.0-rc.1', 'v0.13.0-1', 'v0.13.0-canary1'])(
    'publishes the pre-release %s to canary, and names its installers on canary and dev',
    (tag) => {
      expect(planUpdates({ ...base, event: 'release', action: 'published', prerelease: true, tag })).toEqual({
        ...planUpdates({ ...base, event: 'push' }),
        buildInstallers: true,
        channel: 'canary',
        installer: {
          channels: ['canary', 'dev'],
          filesUrl: `https://github.com/moeru-ai/airi/releases/download/${tag}`,
          downloadPage: `https://github.com/moeru-ai/airi/releases/tag/${tag}`,
        },
        version: '0.13.0',
      })
    },
  )

  it.each(['v0.13.0.1', 'release-2026', 'v0.13'])('publishes nothing for the tag %s', (tag) => {
    const plan = planUpdates({ ...base, event: 'release', action: 'published', prerelease: true, tag })

    expect(plan.channel).toBeUndefined()
    expect(plan.skipReason).toContain(tag)
  })

  it('publishes nothing for a release that is published without being a pre-release first', () => {
    expect(planUpdates({ ...base, event: 'release', action: 'published', prerelease: false, tag: 'v0.13.0' })).toMatchObject({ buildInstallers: false, skipReason: 'This run is not a release.' })
  })

  it('publishes nothing for a release event of another action', () => {
    expect(planUpdates({ ...base, event: 'release', action: 'prereleased', prerelease: true, tag: 'v0.13.0' })).toMatchObject({ skipReason: 'This run is not a release.' })
  })

  it('moves canary to stable when the pre-release becomes a release', () => {
    const plan = planUpdates({ ...base, event: 'release', action: 'released', tag: 'v0.14.0', canary: { bundleVersion: '0.14.0', installerVersion: '0.14.0' } })

    expect(plan).toMatchObject({ buildInstallers: false, promoteFrom: 'canary', version: '0.14.0' })
    expect(plan.channel).toBeUndefined()
    expect(plan.installer).toBeUndefined()
  })

  it('promotes a canary without an installer', () => {
    expect(planUpdates({ ...base, event: 'release', action: 'released', tag: 'v0.14.0', canary: { bundleVersion: '0.14.0' } }).promoteFrom).toBe('canary')
  })

  // A release that canary does not serve must never reach stable, or stable installs would take untested bytes.
  it.each([
    { name: 'another version', canary: { bundleVersion: '0.14.0-rc.2', installerVersion: '0.14.0-rc.2' } },
    { name: 'nothing', canary: {} },
    { name: 'the bundle with an older installer', canary: { bundleVersion: '0.14.0', installerVersion: '0.14.0-rc.2' } },
  ])('stops a promotion when canary serves $name', ({ canary }) => {
    expect(() => planUpdates({ ...base, event: 'release', action: 'released', tag: 'v0.14.0', canary })).toThrow(/Canary/)
  })

  it('publishes a manual release run with a tag to canary, and nothing for other manual runs', () => {
    expect(planUpdates({ ...base, event: 'workflow_dispatch', tag: 'v0.13.0-beta.2' }).channel).toBe('canary')
    expect(planUpdates({ ...base, event: 'workflow_dispatch' })).toMatchObject({ buildInstallers: true, skipReason: 'This run is not a release.' })
    expect(planUpdates({ ...base, event: 'workflow_dispatch' }).channel).toBeUndefined()
    expect(planUpdates({ ...base, event: 'workflow_dispatch', tag: 'v0.13.0', buildOnly: true }).channel).toBeUndefined()
    expect(planUpdates({ ...base, event: 'workflow_dispatch', tag: 'v0.13.0', artifactsOnly: true }).channel).toBeUndefined()
  })
})
