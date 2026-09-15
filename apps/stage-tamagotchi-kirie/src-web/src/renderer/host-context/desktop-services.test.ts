import { beforeEach, describe, expect, it, vi } from 'vitest'

import { openApplicationDataDirectory } from './desktop-services'

const mocks = vi.hoisted(() => ({
  host: {
    context: {},
    platform: {
      openApplicationDataDirectory: vi.fn(),
    },
    runtime: 'kirie' as 'electron' | 'kirie',
  },
}))

vi.mock('./owner', () => ({
  initializeHostContext: () => mocks.host,
}))

describe('host desktop services', () => {
  beforeEach(() => {
    mocks.host.runtime = 'kirie'
    mocks.host.platform.openApplicationDataDirectory.mockReset()
  })

  it('uses Kirie Platform for the application data directory', async () => {
    mocks.host.platform.openApplicationDataDirectory.mockResolvedValue(undefined)

    await expect(openApplicationDataDirectory()).resolves.toBeUndefined()

    expect(mocks.host.platform.openApplicationDataDirectory).toHaveBeenCalledOnce()
  })
})
