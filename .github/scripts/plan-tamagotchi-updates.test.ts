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

  it.each(['v0.13.0', '0.13.0', 'v0.13.0+build.7', 'v0.13.0-beta.1', 'v0.13.0-alpha.36', 'v0.13.0-rc.1', 'v0.13.0-1', 'v0.13.0-canary1'])(
    'publishes the pre-release %s to canary, and names its installers on canary and dev',
    (tag) => {
      expect(planUpdates({ ...base, event: 'release', action: 'prereleased', tag })).toEqual({
        ...planUpdates({ ...base, event: 'push' }),
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
    const plan = planUpdates({ ...base, event: 'release', action: 'prereleased', tag })

    expect(plan.channel).toBeUndefined()
    expect(plan.skipReason).toContain(tag)
  })

  it('publishes nothing for a release event that is not a pre-release or a release', () => {
    expect(planUpdates({ ...base, event: 'release', action: 'published', tag: 'v0.13.0' })).toMatchObject({ skipReason: 'This run is not a release.' })
  })

  it('moves canary to stable when the pre-release becomes a release', () => {
    const plan = planUpdates({ ...base, event: 'release', action: 'released', tag: 'v0.14.0', canary: { bundleVersion: '0.14.0', installerVersion: '0.14.0' } })

    expect(plan).toMatchObject({ promoteFrom: 'canary', version: '0.14.0' })
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
    expect(planUpdates({ ...base, event: 'workflow_dispatch' })).toMatchObject({ skipReason: 'This run is not a release.' })
    expect(planUpdates({ ...base, event: 'workflow_dispatch' }).channel).toBeUndefined()
    expect(planUpdates({ ...base, event: 'workflow_dispatch', tag: 'v0.13.0', buildOnly: true }).channel).toBeUndefined()
    expect(planUpdates({ ...base, event: 'workflow_dispatch', tag: 'v0.13.0', artifactsOnly: true }).channel).toBeUndefined()
  })
})
