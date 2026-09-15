import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useHostDesktopServices } from './desktop-services'

const mocks = vi.hoisted(() => ({
  host: {
    context: {},
    platform: {
      openApplicationDataDirectory: vi.fn(),
      openExternalUrl: vi.fn(),
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
    mocks.host.platform.openExternalUrl.mockReset()
  })

  it('uses Kirie Platform for the application data directory', async () => {
    mocks.host.platform.openApplicationDataDirectory.mockResolvedValue('/tmp/airi')

    await expect(useHostDesktopServices().openApplicationDataDirectory()).resolves.toBe('/tmp/airi')

    expect(mocks.host.platform.openApplicationDataDirectory).toHaveBeenCalledOnce()
  })
})
